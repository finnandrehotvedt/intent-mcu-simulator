/* Copyright 2026 IntentForce */
/* SPDX-License-Identifier: Apache-2.0 */
ENTRY(Reset_Handler)

MEMORY
{
  FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 2M
  SRAM (rw)  : ORIGIN = 0x20000000, LENGTH = 192K
}

PHDRS
{
  flash PT_LOAD FLAGS(5);
}

SECTIONS
{
  . = ORIGIN(FLASH);
  .isr_vector : ALIGN(4)
  {
    KEEP(*(.isr_vector))
  } > FLASH :flash

  .text : ALIGN(4)
  {
    *(.text.Reset_Handler)
    *(.text.Default_Handler)
    *(.text*)
    *(.rodata*)
    *(.glue_7)
    *(.glue_7t)
  } > FLASH :flash

  .ARM.exidx : ALIGN(4)
  {
    *(.ARM.exidx*)
  } > FLASH :flash

  /DISCARD/ :
  {
    *(.comment)
    *(.note*)
    *(.eh_frame*)
    *(.ARM.attributes)
  }

  ASSERT(SIZEOF(.isr_vector) + SIZEOF(.text) + SIZEOF(.ARM.exidx) <= 49152,
    "STM32 source profile exceeds flash transport limit")
}

