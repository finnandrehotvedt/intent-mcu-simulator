/* Copyright 2026 IntentForce
 * SPDX-License-Identifier: Apache-2.0
 * Original minimal linker map for the private RP2040 compiler slice.
 */
ENTRY(Reset_Handler)

MEMORY
{
  FLASH (rx) : ORIGIN = 0x10000000, LENGTH = 2M
}

PHDRS
{
  flash PT_LOAD FLAGS(5);
}

SECTIONS
{
  .text ORIGIN(FLASH) : ALIGN(4)
  {
    KEEP(*(.vectors))
    *(.text.Reset_Handler)
    *(.text*)
    *(.rodata*)
    . = ALIGN(4);
  } > FLASH :flash

  /DISCARD/ :
  {
    *(.ARM.attributes)
    *(.ARM.exidx*)
    *(.comment)
    *(.data*)
    *(.bss*)
    *(.eh_frame*)
  }
}

ASSERT(SIZEOF(.text) <= LENGTH(FLASH), "RP2040 flash image is too large")
