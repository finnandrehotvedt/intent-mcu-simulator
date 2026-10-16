#!/usr/bin/env python3
# Copyright 2026 IntentForce
# SPDX-License-Identifier: Apache-2.0
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

WORKSPACE = Path('/workspace')
SKETCH = WORKSPACE / 'sketch'
BUILD = WORKSPACE / 'build'
OUTPUT = WORKSPACE / 'out'
TOOL_ROOT = Path('/opt/arduino-cli')
LOCK_PATH = Path('/opt/intent-mcu/c3/flash-lock.json')
FQBN = 'esp32:esp32:esp32c3:FlashMode=dio'
PROFILE = 'board.esp32-c3-devmodule-v1'
SHA256 = re.compile(r'^[0-9a-f]{64}$')
MARKER = re.compile(r'^[A-Z0-9][A-Z0-9:_-]{2,63}$')
SOURCE = re.compile(
    r'^// Copyright 2026 IntentForce\n'
    r'// SPDX-License-Identifier: Apache-2\.0\n\n'
    r'void setup\(\) \{\n'
    r'  Serial\.begin\(115200\);\n'
    r'  pinMode\(2, (?P<mode>OUTPUT|INPUT)\);\n'
    r'  digitalWrite\(2, (?P<level>HIGH|LOW)\);\n'
    r'  Serial\.println\("(?P<marker>[A-Z0-9][A-Z0-9:_-]{2,63})"\);\n'
    r'\}\n\nvoid loop\(\) \{\n  delay\(1000\);\n\}\n$')


def digest(path):
    value = hashlib.sha256()
    size = 0
    with path.open('rb') as handle:
        while chunk := handle.read(1024 * 1024):
            value.update(chunk)
            size += len(chunk)
    return value.hexdigest(), size


def exact_keys(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def verify_lock():
    lock = json.loads(LOCK_PATH.read_text(encoding='utf-8'))
    if lock.get('schema') != 'intent-mcu-esp32c3-arduino-flash-lock@1' \
            or lock.get('profile') != PROFILE or lock.get('compileFqbn') != FQBN \
            or lock.get('framework', {}).get('arduinoEsp32Version') != '3.3.10' \
            or lock.get('framework', {}).get('espIdfVersion') != '5.5.4' \
            or lock.get('framework', {}).get('espRv32Version') != '2601' \
            or lock.get('builder', {}).get('network') != 'none' \
            or lock.get('builder', {}).get('pull') != 'never':
        raise RuntimeError('TOOLCHAIN_LOCK_INVALID')
    identities = [
        ('bin/arduino-cli', lock['framework']['arduinoCliSha256']),
        ('state/data/packages/esp32/tools/esp-rv32/2601/bin/riscv32-esp-elf-gcc',
         lock['framework']['gccSha256']),
        ('state/data/packages/esp32/tools/esptool_py/5.3.0/esptool',
         lock['framework']['esptoolSha256']),
        ('state/data/packages/esp32/tools/esp32c3-libs/3.3.10/include/soc/esp32c3/include/soc/soc_caps.h',
         lock['framework']['socCapsSha256']),
    ]
    for relative, expected in identities:
        observed, _ = digest(TOOL_ROOT / relative)
        if observed != expected:
            raise RuntimeError('TOOLCHAIN_IDENTITY_MISMATCH')
    return lock


def diagnostic_lines(stderr):
    output = []
    pattern = re.compile(r'^(?:.*/)?([^/:\n]+):(\d+)(?::(\d+))?:\s*(?:(warning|error|note):\s*)?([^\n]+)$')
    for raw in stderr.splitlines():
        match = pattern.match(raw.strip())
        if not match or len(output) >= 80:
            continue
        message = match.group(5).replace(str(TOOL_ROOT), '<toolchain>')
        message = message.replace(str(WORKSPACE), '<workspace>')
        output.append({
            'file': match.group(1)[:64], 'line': int(match.group(2)),
            'column': int(match.group(3)) if match.group(3) else None,
            'severity': match.group(4) or 'error', 'message': message[:400],
        })
    return output


def record(path):
    sha, size = digest(path)
    return {'sha256': sha, 'bytes': size}


def run():
    raw = sys.stdin.buffer.read(8193)
    if len(raw) > 8192:
        raise RuntimeError('REQUEST_LIMIT')
    job = json.loads(raw.decode('utf-8'))
    if not exact_keys(job, ['schema', 'profile', 'fqbn', 'source', 'sourceSha256', 'marker']) \
            or job['schema'] != 'intent-mcu-esp32c3-builder-job@1' \
            or job['profile'] != PROFILE or job['fqbn'] != FQBN \
            or not isinstance(job['source'], str) or not SHA256.fullmatch(job['sourceSha256']) \
            or not isinstance(job['marker'], str) or not MARKER.fullmatch(job['marker']):
        raise RuntimeError('BUILD_JOB_INVALID')
    source = job['source']
    source_match = SOURCE.fullmatch(source)
    if not source_match or source_match.group('marker') != job['marker'] \
            or hashlib.sha256(source.encode('utf-8')).hexdigest() != job['sourceSha256']:
        raise RuntimeError('SOURCE_IDENTITY_MISMATCH')
    lock = verify_lock()
    for directory in [SKETCH, BUILD, OUTPUT, Path('/tmp/home')]:
        directory.mkdir(parents=True, exist_ok=True)
    (SKETCH / 'sketch.ino').write_text(source, encoding='utf-8', newline='\n')
    command = [
        str(TOOL_ROOT / 'bin/arduino-cli'), '--config-file',
        str(TOOL_ROOT / 'state/arduino-cli.yaml'), 'compile', '--fqbn', FQBN,
        '--clean', '--no-color', '--build-path', str(BUILD), '--output-dir',
        str(OUTPUT), str(SKETCH),
    ]
    environment = {
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME': '/tmp/home', 'NO_UPDATE_NOTIFIER': '1',
        'SOURCE_DATE_EPOCH': str(lock['framework']['sourceDateEpoch']),
        'TZ': 'UTC', 'LC_ALL': 'C',
    }
    completed = subprocess.run(command, capture_output=True, text=True,
                               env=environment, timeout=90, check=False)
    diagnostics = diagnostic_lines(completed.stderr)
    if completed.returncode != 0:
        text = completed.stderr.replace(str(TOOL_ROOT), '<toolchain>')
        text = text.replace(str(WORKSPACE), '<workspace>')[-2000:]
        return {'status': 'failed', 'code': 'COMPILE_FAILED',
                'diagnostics': diagnostics, 'text': text,
                'sourceSha256': job['sourceSha256']}
    boot_app = TOOL_ROOT / 'state/data/packages/esp32/hardware/esp32/3.3.10/tools/partitions/boot_app0.bin'
    shutil.copyfile(boot_app, OUTPUT / 'boot_app0.bin')
    files = {
        'bootloader': OUTPUT / 'sketch.ino.bootloader.bin',
        'partitions': OUTPUT / 'sketch.ino.partitions.bin',
        'bootApp0': OUTPUT / 'boot_app0.bin',
        'application': OUTPUT / 'sketch.ino.bin',
        'elf': OUTPUT / 'sketch.ino.elf',
        'mergedFlash': OUTPUT / 'sketch.ino.merged.bin',
        'flashArgs': BUILD / 'flash_args',
        'partitionCsv': BUILD / 'partitions.csv',
    }
    manifest = {name: record(path) for name, path in files.items()}
    return {
        'status': 'succeeded', 'code': 'BUILD_OK', 'profile': PROFILE,
        'fqbn': FQBN, 'sourceSha256': job['sourceSha256'], 'marker': job['marker'],
        'toolchain': {
            'arduinoCli': '1.5.1', 'arduinoEsp32': '3.3.10',
            'espIdf': '5.5.4', 'compiler': 'esp-rv32 2601', 'flashMode': 'dio',
        },
        'files': manifest,
        'fileData': {name: base64.b64encode(path.read_bytes()).decode('ascii')
                     for name, path in files.items()},
        'diagnostics': diagnostics,
        'isolation': {'network': 'none', 'workspace': 'container-tmpfs-erased-after-build',
                      'toolchain': 'read-only-image-layer'},
    }


try:
    result = run()
except subprocess.TimeoutExpired:
    result = {'status': 'failed', 'code': 'BUILD_TIMEOUT', 'diagnostics': []}
except (json.JSONDecodeError, UnicodeDecodeError):
    result = {'status': 'failed', 'code': 'MALFORMED_JSON', 'diagnostics': []}
except Exception as error:
    code = str(error) if re.fullmatch(r'[A-Z0-9_]{3,64}', str(error)) else 'BUILD_WORKER_FAILURE'
    result = {'status': 'failed', 'code': code, 'diagnostics': []}
sys.stdout.write(json.dumps(result, separators=(',', ':')) + '\n')
