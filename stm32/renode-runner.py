#!/usr/bin/env python3
# Copyright 2026 IntentForce
# SPDX-License-Identifier: Apache-2.0
"""Pinned, private Renode STM32F429 conformance runner.

This is a fixture runner and event bridge, not a compiler or a full STM32
runtime. The official platform definitions are hash-checked and transformed
only to remove remote SVD symbol downloads before networkless execution.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time

PROFILE = "board.stm32f429zi-nucleo144-v1"
ENGINE_ID = "renode"
ENGINE_VERSION = "1.17.0"
RELEASE_ASSET_SHA256 = "4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f"
RENODE_EXECUTABLE_SHA256 = "822209a27168e2ce2e5e679ed481686b555c8e154745431b25d8b4104c34138f"
MAX_SLICE_INSTRUCTIONS = 4096
PROCESS_TIMEOUT_SECONDS = 20
EVENT_SCHEMA = "intent-mcu-runtime-event@1"

PLATFORM_SOURCES = {
    "stm32f4.repl": "a78bb20f3e594fffa9aec25d2ee85a7b165e8a381c603303ee237e7ce67d1194",
    "stm32f429.repl": "b85c51a12329b1e1914d23b177705832f3d0065e61428e35a552efa90dff9d8d",
}

FLASH_BASE = 0x08000000
SRAM_BASE = 0x20000000
SRAM_BYTES = 192 * 1024
RCC_AHB1ENR = 0x40023830
RCC_APB1ENR = 0x40023840
GPIOB_MODER = 0x40020400
GPIOB_BSRR = 0x40020418
USART3_DR = 0x40004804
USART3_CR1 = 0x4000480C
SPI1_CR1 = 0x40013000

EXPECTED_FIXTURE_HASHES = {
    "gpio-uart": "9eeb0e7419937cebfdf3bd3840707507d1e0fd10d0cd744865f35e166b78176d",
    "unsupported-spi": "dfc2276a9e201dc02bf198d3b05c0f6e8b175343701fa76b529f728765029c94",
}
EXPECTED_ELF_FIXTURE_SHA256 = "9d3628cade86bd3e9a734d035ffeefc3c81ff8e5ecbce21528a7ca68590e92aa"
ELF_ARTIFACT_SCHEMA = "intent-mcu-stm32f429-firmware-artifact@1"
ELF_HEADER_BYTES = 52
ELF_PROGRAM_HEADER_BYTES = 32
ELF_MACHINE_ARM = 40
ELF_EABI5 = 0x05000000
ELF_EABI5_SOFT_FLOAT = 0x05000200
MAX_ELF_CONTAINER_BYTES = 48 * 1024
MAX_ELF_LOAD_SEGMENTS = 8
MAX_ELF_LOADED_BYTES = 512 * 1024
FLASH_BYTES = 2 * 1024 * 1024


class ConformanceFault(RuntimeError):
    def __init__(self, code: str, detail: str, *, engine_started: bool = False):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.engine_started = engine_started


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ldr_literal(register: int, instruction_address: int, literal_address: int) -> int:
    aligned_pc = (instruction_address + 4) & ~3
    delta = literal_address - aligned_pc
    if register not in range(8) or delta < 0 or delta > 1020 or delta % 4:
        raise ConformanceFault("RUNTIME_ARTIFACT_INVALID", "fixture literal is outside Thumb range")
    return 0x4800 | (register << 8) | (delta // 4)


def build_fixture(name: str) -> bytes:
    writes_by_name = {
        "gpio-uart": [
            (RCC_AHB1ENR, 1 << 1),
            (RCC_APB1ENR, 1 << 18),
            (GPIOB_MODER, 0x00000001),
            (GPIOB_BSRR, 0x00000001),
            (USART3_CR1, (1 << 13) | (1 << 3)),
            (USART3_DR, 0x53),
            (GPIOB_BSRR, 0x00010000),
            (USART3_DR, 0x46),
        ],
        "unsupported-spi": [(SPI1_CR1, 0x00000001)],
    }
    if name not in writes_by_name:
        raise ConformanceFault("FIRMWARE_FIXTURE_UNSUPPORTED", name)
    code_address = FLASH_BASE + 0x100
    words: list[int] = []
    patches: list[tuple[int, int, int]] = []
    literals: list[int] = []
    for address, value in writes_by_name[name]:
        patches.append((len(words), 0, len(literals)))
        words.append(0)
        literals.append(address)
        patches.append((len(words), 1, len(literals)))
        words.append(0)
        literals.append(value & 0xFFFFFFFF)
        words.append(0x6001)
    words.append(0xE7FE)
    code = bytearray().join(struct.pack("<H", word) for word in words)
    while len(code) % 4:
        code.extend(b"\x00")
    literal_address = code_address + len(code)
    for index, register, literal_index in patches:
        encoded = _ldr_literal(register, code_address + index * 2, literal_address + literal_index * 4)
        code[index * 2:index * 2 + 2] = struct.pack("<H", encoded)
    for value in literals:
        code.extend(struct.pack("<I", value))
    image = bytearray(0x100)
    image[0:8] = struct.pack("<II", SRAM_BASE + SRAM_BYTES, code_address | 1)
    image.extend(code)
    artifact = bytes(image)
    actual = sha256_bytes(artifact)
    if actual != EXPECTED_FIXTURE_HASHES[name]:
        raise ConformanceFault("RUNTIME_ARTIFACT_INVALID", f"{name} hash {actual}")
    return artifact


def _checked_range(start: int, size: int, code: str = "FIRMWARE_SEGMENT_INVALID") -> tuple[int, int]:
    if not isinstance(start, int) or not isinstance(size, int) or start < 0 or size < 1:
        raise ConformanceFault(code, "invalid range")
    end = start + size
    if end <= start or end > 0x100000000:
        raise ConformanceFault(code, "range overflow")
    return start, end


def _checked_file_range(offset: int, size: int, container_bytes: int, code: str) -> tuple[int, int]:
    start, end = _checked_range(offset, size, code)
    if end > container_bytes:
        raise ConformanceFault(code, "truncated file range")
    return start, end


def _memory_region(address: int, size: int) -> tuple[str, int, int]:
    start, end = _checked_range(address, size, "FIRMWARE_ADDRESS_OUT_OF_RANGE")
    if start >= FLASH_BASE and end <= FLASH_BASE + FLASH_BYTES:
        return "flash", start, end
    if start >= SRAM_BASE and end <= SRAM_BASE + SRAM_BYTES:
        return "sram", start, end
    raise ConformanceFault("FIRMWARE_ADDRESS_OUT_OF_RANGE", f"0x{address:x}+{size}")


def _assert_no_overlap(ranges: list[tuple[int, int]]) -> None:
    ordered = sorted(ranges)
    for previous, current in zip(ordered, ordered[1:]):
        if current[0] < previous[1]:
            raise ConformanceFault("FIRMWARE_SEGMENT_OVERLAP", "overlapping ranges")


def parse_stm32f429_elf(data: bytes, expected_sha256: str) -> dict:
    if not isinstance(data, bytes) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256 or ""):
        raise ConformanceFault("FIRMWARE_INPUT_INVALID", "bytes and lowercase SHA-256 required")
    if len(data) < 1 or len(data) > MAX_ELF_CONTAINER_BYTES:
        raise ConformanceFault("FIRMWARE_SIZE_INVALID", f"bytes={len(data)}")
    actual_sha256 = sha256_bytes(data)
    if actual_sha256 != expected_sha256:
        raise ConformanceFault("FIRMWARE_HASH_MISMATCH", actual_sha256)
    if len(data) < ELF_HEADER_BYTES:
        raise ConformanceFault("FIRMWARE_SIZE_INVALID", "truncated ELF header")
    if (
        data[0:8] != b"\x7fELF\x01\x01\x01\x00"
        or any(data[8:16])
    ):
        raise ConformanceFault("FIRMWARE_ELF_HEADER_INVALID", "requires ELF32 little-endian SYSV")
    (
        elf_type,
        machine,
        version,
        raw_entry,
        program_offset,
        section_offset,
        flags,
        header_bytes,
        program_entry_bytes,
        program_count,
        section_entry_bytes,
        section_count,
        section_names,
    ) = struct.unpack_from("<HHIIIIIHHHHHH", data, 16)
    if (
        elf_type != 2
        or version != 1
        or header_bytes != ELF_HEADER_BYTES
        or program_entry_bytes != ELF_PROGRAM_HEADER_BYTES
        or program_count < 1
        or program_count > MAX_ELF_LOAD_SEGMENTS
        or program_offset < ELF_HEADER_BYTES
    ):
        raise ConformanceFault("FIRMWARE_ELF_HEADER_INVALID", "unsupported executable layout")
    if machine != ELF_MACHINE_ARM:
        raise ConformanceFault("FIRMWARE_ELF_ARCH_INVALID", f"machine {machine}")
    if flags not in (ELF_EABI5, ELF_EABI5_SOFT_FLOAT):
        raise ConformanceFault("FIRMWARE_ELF_FLAGS_UNSUPPORTED", f"0x{flags:x}")
    if any((section_offset, section_entry_bytes, section_count, section_names)):
        raise ConformanceFault(
            "FIRMWARE_ELF_HEADER_INVALID",
            "section tables are outside the private subset",
        )
    _, program_table_end = _checked_file_range(
        program_offset,
        program_count * program_entry_bytes,
        len(data),
        "FIRMWARE_ELF_HEADER_INVALID",
    )
    segments = []
    memory_ranges = []
    file_ranges = []
    loaded_bytes = 0
    for index in range(program_count):
        offset = program_offset + index * program_entry_bytes
        (
            program_type,
            file_offset,
            virtual_address,
            physical_address,
            file_bytes,
            memory_bytes,
            segment_flags,
            alignment,
        ) = struct.unpack_from("<IIIIIIII", data, offset)
        if program_type != 1:
            raise ConformanceFault(
                "FIRMWARE_ELF_PROGRAM_TYPE_UNSUPPORTED",
                f"program {index} type {program_type}",
            )
        alignment_valid = alignment in (0, 1) or (
            alignment <= 4096
            and alignment & (alignment - 1) == 0
            and virtual_address % alignment == file_offset % alignment
        )
        if (
            memory_bytes < 1
            or file_bytes > memory_bytes
            or physical_address != virtual_address
            or segment_flags & ~7
            or not alignment_valid
        ):
            raise ConformanceFault("FIRMWARE_SEGMENT_INVALID", f"program {index}")
        region, start, end = _memory_region(virtual_address, memory_bytes)
        if (region == "flash" and segment_flags != 5) or (
            region == "sram" and segment_flags != 6
        ):
            raise ConformanceFault(
                "FIRMWARE_SEGMENT_INVALID",
                "flash must be RX and SRAM must be RW",
            )
        loaded_bytes += memory_bytes
        if loaded_bytes > MAX_ELF_LOADED_BYTES:
            raise ConformanceFault("FIRMWARE_SIZE_INVALID", "loaded image exceeds private subset")
        memory_ranges.append((start, end))
        payload = bytearray(memory_bytes)
        if file_bytes:
            file_start, file_end = _checked_file_range(
                file_offset,
                file_bytes,
                len(data),
                "FIRMWARE_SEGMENT_INVALID",
            )
            if file_start < program_table_end:
                raise ConformanceFault(
                    "FIRMWARE_SEGMENT_INVALID",
                    "load data overlaps ELF headers",
                )
            file_ranges.append((file_start, file_end))
            payload[0:file_bytes] = data[file_start:file_end]
        segments.append(
            {
                "region": region,
                "address": virtual_address,
                "fileBytes": file_bytes,
                "memoryBytes": memory_bytes,
                "flags": ["read", "execute"] if region == "flash" else ["read", "write"],
                "data": bytes(payload),
            }
        )
    _assert_no_overlap(memory_ranges)
    _assert_no_overlap(file_ranges)
    vector = next(
        (
            segment
            for segment in segments
            if segment["region"] == "flash"
            and segment["address"] == FLASH_BASE
            and segment["fileBytes"] >= 8
        ),
        None,
    )
    if vector is None:
        raise ConformanceFault("FIRMWARE_VECTOR_INVALID", "missing flash vector table")
    initial_sp, reset_vector = struct.unpack_from("<II", vector["data"], 0)
    if (
        initial_sp <= SRAM_BASE
        or initial_sp > SRAM_BASE + SRAM_BYTES
        or initial_sp % 8
    ):
        raise ConformanceFault("FIRMWARE_VECTOR_INVALID", "initial SP outside aligned SRAM")
    if reset_vector & 1 != 1:
        raise ConformanceFault("FIRMWARE_ENTRYPOINT_INVALID", "reset vector is not Thumb")
    entry_point = reset_vector & 0xFFFFFFFE
    executable = any(
        segment["region"] == "flash"
        and entry_point >= segment["address"]
        and entry_point + 2 <= segment["address"] + segment["fileBytes"]
        for segment in segments
    )
    if not executable or entry_point % 2 or raw_entry != reset_vector:
        raise ConformanceFault("FIRMWARE_ENTRYPOINT_INVALID", "ELF entry/reset vector mismatch")
    descriptor = {
        "schema": ELF_ARTIFACT_SCHEMA,
        "profile": PROFILE,
        "architecture": "armv7em",
        "mcuVariant": "STM32F429ZI",
        "purpose": "private-precompiled-renode-conformance-subset",
        "format": "elf32",
        "container": {"bytes": len(data), "sha256": actual_sha256},
        "initialStackPointer": initial_sp,
        "resetVector": reset_vector,
        "entryPoint": entry_point,
        "segments": [
            {
                key: value
                for key, value in {
                    **segment,
                    "sha256": sha256_bytes(segment["data"]),
                }.items()
                if key != "data"
            }
            for segment in segments
        ],
        "compiler": "unavailable",
        "fullStm32Support": False,
        "publicSupport": False,
    }
    return {"descriptor": descriptor, "loadSegments": segments}


def verify_original_fixture_elf(loaded: dict) -> None:
    expected_raw = build_fixture("gpio-uart")
    segments = loaded["loadSegments"]
    if (
        loaded["descriptor"]["container"]["sha256"] != EXPECTED_ELF_FIXTURE_SHA256
        or len(segments) != 1
        or segments[0]["address"] != FLASH_BASE
        or segments[0]["fileBytes"] != len(expected_raw)
        or segments[0]["memoryBytes"] != len(expected_raw)
        or segments[0]["data"] != expected_raw
    ):
        raise ConformanceFault(
            "FIRMWARE_PROVENANCE_MISMATCH",
            "ELF is not the sealed original GPIO/USART fixture",
        )


def verify_engine(renode_root: Path) -> dict:
    executable = renode_root / "renode"
    if not executable.is_file():
        raise ConformanceFault("RUNTIME_ENGINE_NOT_INSTALLED", str(executable))
    executable_sha = sha256_file(executable)
    if executable_sha != RENODE_EXECUTABLE_SHA256:
        raise ConformanceFault("RUNTIME_ENGINE_IDENTITY_MISMATCH", executable_sha)
    platform_hashes = {}
    for name, expected in PLATFORM_SOURCES.items():
        source = renode_root / "platforms" / "cpus" / name
        actual = sha256_file(source)
        if actual != expected:
            raise ConformanceFault("RUNTIME_PLATFORM_IDENTITY_MISMATCH", f"{name} {actual}")
        platform_hashes[name] = actual
    return {"executableSha256": executable_sha, "platformSha256": platform_hashes}


def prepare_offline_platform(renode_root: Path, work: Path) -> dict:
    platform_dir = work / "platform"
    platform_dir.mkdir(mode=0o700)
    result = {}
    for name, expected in PLATFORM_SOURCES.items():
        source = renode_root / "platforms" / "cpus" / name
        data = source.read_bytes()
        if sha256_bytes(data) != expected:
            raise ConformanceFault("RUNTIME_PLATFORM_IDENTITY_MISMATCH", name)
        lines = data.decode("utf-8").splitlines()
        if name == "stm32f429.repl":
            removed = {
                "sysbus:",
                "    init:",
                "        ApplySVD @https://dl.antmicro.com/projects/renode/svd/STM32F429x.svd.gz",
            }
            filtered = [line for line in lines if line not in removed]
        else:
            filtered = [line for line in lines if "ApplySVD @https://" not in line]
        output = ("\n".join(filtered) + "\n").encode("utf-8")
        if b"http://" in output or b"https://" in output:
            raise ConformanceFault("RUNTIME_NETWORK_REFERENCE_RETAINED", name)
        target = platform_dir / name
        target.write_bytes(output)
        target.chmod(0o600)
        result[name] = {"officialSha256": expected, "offlineSha256": sha256_bytes(output)}
    board = (
        'using "./stm32f429.repl"\n\n'
        "UserLED: Miscellaneous.LED @ gpioPortB\n\n"
        "gpioPortB:\n"
        "    0 -> UserLED@0\n"
    ).encode("utf-8")
    board_path = platform_dir / "nucleo_f429zi_intentforce.repl"
    board_path.write_bytes(board)
    board_path.chmod(0o600)
    result[board_path.name] = {"sha256": sha256_bytes(board)}
    return result


def gpio_uart_script(
    work: Path,
    budget: int,
    load_commands: str | None = None,
    initial_sp: int = SRAM_BASE + SRAM_BYTES,
    reset_vector: int = FLASH_BASE + 0x101,
) -> str:
    board = work / "platform" / "nucleo_f429zi_intentforce.repl"
    fixture = work / "gpio-uart.bin"
    commands = load_commands or f"sysbus LoadBinary @{fixture} 0x08000000"
    return f'''using sysbus
mach create "stm32f429zi-private"
machine LoadPlatformDescription @{board}
{commands}
macro reset
"""
    cpu SetRegister 13 {initial_sp}
    cpu PC {reset_vector}
"""
runMacro $reset

python """
from System import Console
from Antmicro.Renode.Peripherals.Bus import Access, SysbusAccessWidth
cpu = monitor.Machine["sysbus.cpu"]
bus = monitor.Machine.SystemBus
uart = monitor.Machine["sysbus.usart3"]
epoch = 0
def gpio_write(_, __, ___, value):
    level = 1 if value == 1 else 0 if value == 0x10000 else -1
    Console.WriteLine("INTENT_EVENT epoch={{0}} type=gpio pin=PB0 level={{1}} value={{2}} instructionOrdinal={{3}}".format(epoch, level, int(value), int(cpu.ExecutedInstructions) + 1))
def uart_write(_, __, ___, value):
    Console.WriteLine("INTENT_EVENT epoch={{0}} type=uart-mmio port=USART3 value={{1}} instructionOrdinal={{2}}".format(epoch, int(value), int(cpu.ExecutedInstructions) + 1))
def uart_tx(value):
    Console.WriteLine("INTENT_EVENT epoch={{0}} type=uart-tx port=USART3 value={{1}} instructionOrdinal={{2}}".format(epoch, int(value), int(cpu.ExecutedInstructions) + 1))
bus.AddWatchpointHook(0x40020418, SysbusAccessWidth.DoubleWord, Access.Write, gpio_write)
bus.AddWatchpointHook(0x40004804, SysbusAccessWidth.DoubleWord, Access.Write, uart_write)
uart.CharReceived += uart_tx
"""
cpu Step {budget}
python """
from System import Console
cpu = monitor.Machine["sysbus.cpu"]
bus = monitor.Machine.SystemBus
Console.WriteLine("INTENT_FINAL epoch=0 instructions={{0}} gpiob_odr={{1}}".format(int(cpu.ExecutedInstructions), int(bus.ReadDoubleWord(0x40020414))))
"""
machine Reset
python "epoch = 1"
cpu Step {budget}
python """
from System import Console
cpu = monitor.Machine["sysbus.cpu"]
bus = monitor.Machine.SystemBus
Console.WriteLine("INTENT_FINAL epoch=1 instructions={{0}} gpiob_odr={{1}}".format(int(cpu.ExecutedInstructions), int(bus.ReadDoubleWord(0x40020414))))
"""
quit
'''


def unsupported_script(work: Path, budget: int) -> str:
    board = work / "platform" / "nucleo_f429zi_intentforce.repl"
    fixture = work / "unsupported-spi.bin"
    return f'''using sysbus
mach create "stm32f429zi-private"
machine LoadPlatformDescription @{board}
sysbus Unregister sysbus.spi1
sysbus LoadBinary @{fixture} 0x08000000
cpu SetRegister 13 0x20030000
cpu PC 0x08000101
python """
from System import Console
from Antmicro.Renode.Peripherals.Bus import Access, SysbusAccessWidth
cpu = monitor.Machine["sysbus.cpu"]
bus = monitor.Machine.SystemBus
def unsupported_spi(_, __, ___, value):
    Console.WriteLine("INTENT_FAULT code=RUNTIME_CAPABILITY_UNSUPPORTED peripheral=SPI1 address=1073819648 value={{0}} instructionOrdinal={{1}}".format(int(value), int(cpu.ExecutedInstructions) + 1))
bus.AddWatchpointHook(0x40013000, SysbusAccessWidth.DoubleWord, Access.Write, unsupported_spi)
"""
cpu Step {budget}
python """
from System import Console
cpu = monitor.Machine["sysbus.cpu"]
bus = monitor.Machine.SystemBus
Console.WriteLine("INTENT_UNSUPPORTED_FINAL instructions={{0}} spi1_unmapped_readback={{1}}".format(int(cpu.ExecutedInstructions), int(bus.ReadDoubleWord(0x40013000))))
"""
quit
'''


EVENT_RE = re.compile(
    r"INTENT_EVENT epoch=(\d+) type=(gpio|uart-mmio|uart-tx) "
    r"(?:pin=PB0 level=(-?\d+) value=(\d+)|port=USART3 value=(\d+)) "
    r"instructionOrdinal=(\d+)"
)
FINAL_RE = re.compile(r"INTENT_FINAL epoch=(\d+) instructions=(\d+) gpiob_odr=(\d+)")
FAULT_RE = re.compile(
    r"INTENT_FAULT code=RUNTIME_CAPABILITY_UNSUPPORTED peripheral=SPI1 "
    r"address=1073819648 value=(\d+) instructionOrdinal=(\d+)"
)
UNSUPPORTED_FINAL_RE = re.compile(r"INTENT_UNSUPPORTED_FINAL instructions=(\d+) spi1_unmapped_readback=(\d+)")


def parse_gpio_uart(output: str, fixture_sha: str, platform: dict) -> dict:
    if "Renode, version 1.17.0" not in output:
        raise ConformanceFault("RUNTIME_ENGINE_IDENTITY_MISMATCH", "version banner missing", engine_started=True)
    raw_events = []
    for match in EVENT_RE.finditer(output):
        epoch, kind, level, gpio_value, uart_value, ordinal = match.groups()
        raw_events.append({
            "epoch": int(epoch),
            "type": kind,
            "level": None if level is None else int(level),
            "value": int(gpio_value if gpio_value is not None else uart_value),
            "instructionOrdinal": int(ordinal),
        })
    expected_epoch = [
        {"type": "gpio", "level": 1, "value": 1, "instructionOrdinal": 12},
        {"type": "uart-mmio", "level": None, "value": 83, "instructionOrdinal": 18},
        {"type": "uart-tx", "level": None, "value": 83, "instructionOrdinal": 18},
        {"type": "gpio", "level": 0, "value": 65536, "instructionOrdinal": 21},
        {"type": "uart-mmio", "level": None, "value": 70, "instructionOrdinal": 24},
        {"type": "uart-tx", "level": None, "value": 70, "instructionOrdinal": 24},
    ]
    for epoch in (0, 1):
        actual = [{k: v for k, v in event.items() if k != "epoch"} for event in raw_events if event["epoch"] == epoch]
        if actual != expected_epoch:
            raise ConformanceFault("RUNTIME_EVENT_MISMATCH", f"epoch {epoch}: {actual}", engine_started=True)
    finals = [tuple(map(int, match.groups())) for match in FINAL_RE.finditer(output)]
    if finals != [(0, 25, 0), (1, 25, 0)]:
        raise ConformanceFault("RUNTIME_FINAL_STATE_MISMATCH", str(finals), engine_started=True)
    events = []
    sequence = 0
    for raw in raw_events:
        if raw["type"] == "uart-mmio":
            continue
        sequence += 1
        event = {
            "schema": EVENT_SCHEMA,
            "sequence": sequence,
            "epoch": raw["epoch"],
            "cycle": raw["instructionOrdinal"],
            "type": raw["type"],
        }
        if raw["type"] == "gpio":
            event.update({"pin": "PB0", "level": bool(raw["level"]), "mode": "output"})
        else:
            event.update({"port": "USART3", "value": raw["value"]})
        events.append(event)
    reset_signature = lambda event: {
        key: value for key, value in event.items() if key not in ("sequence", "epoch")
    }
    reset_replay = (
        [reset_signature(event) for event in events[:4]]
        == [reset_signature(event) for event in events[4:]]
    )
    return {
        "schema": "intent-mcu-renode-conformance@1",
        "accepted": True,
        "profile": PROFILE,
        "engine": {
            "id": ENGINE_ID,
            "version": ENGINE_VERSION,
            "releaseAssetSha256": RELEASE_ASSET_SHA256,
            "executableSha256": RENODE_EXECUTABLE_SHA256,
        },
        "fixture": {"name": "gpio-uart", "sha256": fixture_sha},
        "events": events,
        "resetReplay": reset_replay,
        "finalState": {"PB0": False, "gpiobOdr": 0},
        "platform": platform,
        "instructionOrdinalsNotPhysicalCycles": True,
        "compiler": "unavailable",
        "fullStm32Support": False,
        "publicSupport": False,
    }


def parse_source_gpio_uart(
    output: str,
    loaded_elf: dict,
    expected_pb0: bool,
    expected_uart: bytes,
    platform: dict,
    budget: int,
) -> dict:
    if "Renode, version 1.17.0" not in output:
        raise ConformanceFault(
            "RUNTIME_ENGINE_IDENTITY_MISMATCH",
            "version banner missing",
            engine_started=True,
        )
    raw_events = []
    for match in EVENT_RE.finditer(output):
        epoch, kind, level, gpio_value, uart_value, ordinal = match.groups()
        raw_events.append({
            "epoch": int(epoch),
            "type": kind,
            "level": None if level is None else int(level),
            "value": int(gpio_value if gpio_value is not None else uart_value),
            "instructionOrdinal": int(ordinal),
        })
    epoch_events = []
    expected_gpio_value = 1 if expected_pb0 else 0x10000
    for epoch in (0, 1):
        current = [event for event in raw_events if event["epoch"] == epoch]
        gpio = [event for event in current if event["type"] == "gpio"]
        mmio = [event["value"] for event in current if event["type"] == "uart-mmio"]
        uart = [event["value"] for event in current if event["type"] == "uart-tx"]
        if (
            len(gpio) != 1
            or gpio[0]["level"] != int(expected_pb0)
            or gpio[0]["value"] != expected_gpio_value
            or mmio != list(expected_uart)
            or uart != list(expected_uart)
        ):
            raise ConformanceFault(
                "SOURCE_RUNTIME_OBSERVATION_MISMATCH",
                f"epoch={epoch} gpio={gpio} mmio={mmio} uart={uart}",
                engine_started=True,
            )
        epoch_events.append(current)
    normalized = lambda events: [
        {key: value for key, value in event.items() if key != "epoch"}
        for event in events
    ]
    if normalized(epoch_events[0]) != normalized(epoch_events[1]):
        raise ConformanceFault(
            "SOURCE_RUNTIME_RESET_MISMATCH",
            "event sequence changed after reset",
            engine_started=True,
        )
    finals = [tuple(map(int, match.groups())) for match in FINAL_RE.finditer(output)]
    expected_odr = 1 if expected_pb0 else 0
    if (
        len(finals) != 2
        or finals[0][0] != 0
        or finals[1][0] != 1
        or finals[0][1] != finals[1][1]
        or finals[0][1] < 1
        or finals[0][1] > budget
        or finals[0][2] != expected_odr
        or finals[1][2] != expected_odr
    ):
        raise ConformanceFault(
            "RUNTIME_FINAL_STATE_MISMATCH",
            str(finals),
            engine_started=True,
        )
    events = []
    sequence = 0
    for raw in raw_events:
        if raw["type"] == "uart-mmio":
            continue
        sequence += 1
        event = {
            "schema": EVENT_SCHEMA,
            "sequence": sequence,
            "epoch": raw["epoch"],
            "cycle": raw["instructionOrdinal"],
            "type": raw["type"],
        }
        if raw["type"] == "gpio":
            event.update({"pin": "PB0", "level": bool(raw["level"]), "mode": "output"})
        else:
            event.update({"port": "USART3", "value": raw["value"]})
        events.append(event)
    descriptor = {
        **loaded_elf["descriptor"],
        "purpose": "private-compiler-generated-bounded-source-renode-subset",
        "compiler": "arm-none-eabi-gcc-14.3.1",
    }
    return {
        "schema": "intent-mcu-renode-conformance@1",
        "accepted": True,
        "profile": PROFILE,
        "engine": {
            "id": ENGINE_ID,
            "version": ENGINE_VERSION,
            "releaseAssetSha256": RELEASE_ASSET_SHA256,
            "executableSha256": RENODE_EXECUTABLE_SHA256,
        },
        "artifact": descriptor,
        "events": events,
        "observed": {
            "pb0": expected_pb0,
            "uartText": expected_uart.decode("ascii"),
        },
        "resetReplay": True,
        "finalState": {"PB0": expected_pb0, "gpiobOdr": expected_odr},
        "platform": platform,
        "instructionOrdinalsNotPhysicalCycles": True,
        "unsupportedMmioBlockedBySourceProfile": True,
        "compiler": "arm-none-eabi-gcc-14.3.1",
        "fullStm32Support": False,
        "publicSupport": False,
    }
def parse_unsupported(output: str, fixture_sha: str, platform: dict) -> dict:
    fault = FAULT_RE.search(output)
    final = UNSUPPORTED_FINAL_RE.search(output)
    if not fault or tuple(map(int, fault.groups())) != (1, 3):
        raise ConformanceFault("RUNTIME_UNSUPPORTED_GUARD_MISSING", "SPI1 fault record missing", engine_started=True)
    if not final or tuple(map(int, final.groups())) != (4, 0):
        raise ConformanceFault("RUNTIME_UNSUPPORTED_SIDE_EFFECT", "SPI1 did not remain unmapped", engine_started=True)
    if "WriteDoubleWord to non existing peripheral at 0x40013000, value 0x1" not in output:
        raise ConformanceFault("RUNTIME_UNSUPPORTED_GUARD_MISSING", "Renode unmapped write record missing", engine_started=True)
    return {
        "schema": "intent-mcu-renode-conformance@1",
        "accepted": False,
        "expectedRejection": True,
        "code": "RUNTIME_CAPABILITY_UNSUPPORTED",
        "profile": PROFILE,
        "engine": {"id": ENGINE_ID, "version": ENGINE_VERSION},
        "fixture": {"name": "unsupported-spi", "sha256": fixture_sha},
        "fault": {"peripheral": "SPI1", "address": SPI1_CR1, "value": 1, "instructionOrdinal": 3},
        "unmappedReadback": 0,
        "platform": platform,
        "publicSupport": False,
    }


def run_conformance(
    renode_root: Path,
    state_root: Path,
    fixture: str,
    budget: int,
    elf_bytes: bytes | None = None,
    expected_sha256: str | None = None,
    expected_pb0: bool | None = None,
    expected_uart: bytes | None = None,
) -> dict:
    if not isinstance(budget, int) or budget < 1:
        raise ConformanceFault("RUNTIME_COMMAND_INVALID", f"budget={budget}")
    if budget > MAX_SLICE_INSTRUCTIONS:
        raise ConformanceFault("RUNTIME_SLICE_LIMIT", f"budget={budget}; maximum={MAX_SLICE_INSTRUCTIONS}")
    required_budget = (
        MAX_SLICE_INSTRUCTIONS
        if fixture == "elf-source"
        else 32 if fixture in ("gpio-uart", "elf-gpio-uart") else 4
    )
    if budget != required_budget:
        raise ConformanceFault("RUNTIME_CONFORMANCE_BUDGET_INVALID", f"{fixture} requires {required_budget}")
    loaded_elf = None
    if fixture in ("elf-gpio-uart", "elf-source"):
        loaded_elf = parse_stm32f429_elf(elf_bytes, expected_sha256)
        if fixture == "elf-gpio-uart":
            verify_original_fixture_elf(loaded_elf)
        elif not isinstance(expected_pb0, bool) or not isinstance(expected_uart, bytes):
            raise ConformanceFault("SOURCE_RUNTIME_REQUEST_INVALID", "expected behavior missing")
    identity = verify_engine(renode_root)
    state_root.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="stm32f429-renode-", dir=state_root))
    try:
        platform = prepare_offline_platform(renode_root, work)
        raw_fixture_name = "gpio-uart" if fixture == "elf-gpio-uart" else fixture
        artifact = b"" if fixture == "elf-source" else build_fixture(raw_fixture_name)
        if artifact:
            artifact_path = work / f"{raw_fixture_name}.bin"
            artifact_path.write_bytes(artifact)
            artifact_path.chmod(0o600)
        if fixture in ("elf-gpio-uart", "elf-source"):
            load_lines = []
            for index, segment in enumerate(loaded_elf["loadSegments"]):
                segment_path = work / f"elf-segment-{index}.bin"
                segment_path.write_bytes(segment["data"])
                segment_path.chmod(0o600)
                load_lines.append(f"sysbus LoadBinary @{segment_path} 0x{segment['address']:08x}")
            script = gpio_uart_script(
                work,
                budget,
                "\n".join(load_lines),
                loaded_elf["descriptor"]["initialStackPointer"],
                loaded_elf["descriptor"]["resetVector"],
            )
        else:
            script = gpio_uart_script(work, budget) if fixture == "gpio-uart" else unsupported_script(work, budget)
        script_path = work / f"{fixture}.resc"
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o600)
        command = [
            str(renode_root / "renode"), "--console", "--disable-gui", "-p", str(script_path),
        ]
        try:
            completed = subprocess.run(
                command,
                cwd=renode_root,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=PROCESS_TIMEOUT_SECONDS,
                env={"HOME": os.environ.get("HOME", "/tmp"), "LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin"},
            )
        except subprocess.TimeoutExpired as error:
            raise ConformanceFault("RUNTIME_WATCHDOG_TIMEOUT", str(error), engine_started=True) from error
        output = completed.stdout
        if completed.returncode != 0:
            raise ConformanceFault("RUNTIME_ENGINE_EXIT", f"exit={completed.returncode}", engine_started=True)
        if fixture == "elf-source":
            result = parse_source_gpio_uart(
                output,
                loaded_elf,
                expected_pb0,
                expected_uart,
                platform,
                budget,
            )
        elif fixture in ("gpio-uart", "elf-gpio-uart"):
            result = parse_gpio_uart(output, sha256_bytes(artifact), platform)
        else:
            result = parse_unsupported(output, sha256_bytes(artifact), platform)
        if fixture == "elf-gpio-uart":
            result["fixture"] = {
                "name": fixture,
                "sha256": loaded_elf["descriptor"]["container"]["sha256"],
            }
            result["artifact"] = {
                **loaded_elf["descriptor"],
                "sourceFixture": {
                    "format": "raw-vector-image",
                    "sha256": EXPECTED_FIXTURE_HASHES["gpio-uart"],
                    "compilerInvoked": False,
                },
            }
        result["engineIdentity"] = identity
        result["rawLogSha256"] = sha256_bytes(output.encode("utf-8"))
        return result
    finally:
        shutil.rmtree(work, ignore_errors=True)


def descriptor(renode_root: Path) -> dict:
    identity = verify_engine(renode_root)
    return {
        "schema": "intent-mcu-runtime-descriptor@1",
        "profile": PROFILE,
        "role": "private-conformance-runner",
        "engine": {
            "id": ENGINE_ID,
            "version": ENGINE_VERSION,
            "releaseAssetSha256": RELEASE_ASSET_SHA256,
            **identity,
        },
        "capabilities": [
            "strict-elf32-admission",
            "gpio",
            "uart",
            "reset-replay",
            "unsupported-register-guard",
        ],
        "sandboxRequired": {
            "network": "none",
            "readOnlyRoot": True,
            "capDropAll": True,
            "noNewPrivileges": True,
            "tmpfsExecReason": "Renode maps its verified translation library from disposable /tmp",
        },
        "compiler": "unavailable",
        "fullStm32Support": False,
        "publicSupport": False,
    }


def emit(value: dict) -> None:
    sys.stdout.write(json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renode-root", type=Path, default=Path("/renode"))
    parser.add_argument("--state-root", type=Path, default=Path("/tmp"))
    parser.add_argument(
        "--fixture",
        choices=sorted([*EXPECTED_FIXTURE_HASHES, "elf-gpio-uart", "elf-source"]),
        default="gpio-uart",
    )
    parser.add_argument("--budget", type=int, default=32)
    parser.add_argument("--elf-base64")
    parser.add_argument("--expected-sha256")
    parser.add_argument("--expected-pb0", choices=("0", "1"))
    parser.add_argument("--expected-uart-base64")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--idle", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_check or args.idle:
            emit(descriptor(args.renode_root))
            if args.idle:
                while True:
                    time.sleep(60)
            return 0
        elf_bytes = None
        expected_pb0 = None
        expected_uart = None
        if args.fixture in ("elf-gpio-uart", "elf-source"):
            if (
                not isinstance(args.elf_base64, str)
                or len(args.elf_base64) > ((MAX_ELF_CONTAINER_BYTES + 2) // 3) * 4
            ):
                raise ConformanceFault("FIRMWARE_SIZE_INVALID", "base64 container bound")
            try:
                elf_bytes = base64.b64decode(args.elf_base64, validate=True)
            except (binascii.Error, ValueError) as error:
                raise ConformanceFault("FIRMWARE_INPUT_INVALID", "invalid base64") from error
            if args.fixture == "elf-source":
                if args.expected_pb0 is None or not isinstance(args.expected_uart_base64, str):
                    raise ConformanceFault("SOURCE_RUNTIME_REQUEST_INVALID", "expected behavior missing")
                try:
                    expected_uart = base64.b64decode(args.expected_uart_base64, validate=True)
                except (binascii.Error, ValueError) as error:
                    raise ConformanceFault("SOURCE_RUNTIME_REQUEST_INVALID", "invalid UART base64") from error
                if not re.fullmatch(rb"[A-Z0-9 _-]{1,24}\n", expected_uart):
                    raise ConformanceFault("SOURCE_RUNTIME_REQUEST_INVALID", "UART outside source profile")
                expected_pb0 = args.expected_pb0 == "1"
            elif args.expected_pb0 is not None or args.expected_uart_base64 is not None:
                raise ConformanceFault("FIRMWARE_INPUT_INVALID", "source expectations require elf-source")
        elif any(value is not None for value in (
            args.elf_base64,
            args.expected_sha256,
            args.expected_pb0,
            args.expected_uart_base64,
        )):
            raise ConformanceFault("FIRMWARE_INPUT_INVALID", "ELF fields require elf-gpio-uart")
        emit(run_conformance(
            args.renode_root,
            args.state_root,
            args.fixture,
            args.budget,
            elf_bytes,
            args.expected_sha256,
            expected_pb0,
            expected_uart,
        ))
        return 0
    except KeyboardInterrupt:
        return 0
    except ConformanceFault as error:
        emit({
            "schema": "intent-mcu-renode-conformance@1",
            "accepted": False,
            "code": error.code,
            "detail": error.detail,
            "engineStarted": error.engine_started,
            "publicSupport": False,
        })
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
