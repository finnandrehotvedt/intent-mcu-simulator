/* Copyright 2026 IntentForce
 * SPDX-License-Identifier: Apache-2.0
 * Project-owned bounded MMIO helpers; this is not a vendor SDK.
 */
#ifndef INTENT_RP2040_RUNTIME_H
#define INTENT_RP2040_RUNTIME_H

typedef unsigned int intent_u32;
typedef unsigned char intent_u8;

#define INTENT_MMIO32(address) (*(volatile intent_u32 *)(address))
#define INTENT_IO_BANK0_GPIO0_CTRL 0x40014004u
#define INTENT_SIO_GPIO_OUT_SET    0xd0000014u
#define INTENT_SIO_GPIO_OUT_CLR    0xd0000018u
#define INTENT_SIO_GPIO_OE_SET     0xd0000024u
#define INTENT_UART0_DR            0x40034000u
#define INTENT_UART0_CR            0x40034030u

static __attribute__((always_inline)) inline void intent_gpio0_output(intent_u32 level)
{
  INTENT_MMIO32(INTENT_IO_BANK0_GPIO0_CTRL) = 5u;
  INTENT_MMIO32(INTENT_SIO_GPIO_OE_SET) = 1u;
  if (level != 0u) INTENT_MMIO32(INTENT_SIO_GPIO_OUT_SET) = 1u;
  else INTENT_MMIO32(INTENT_SIO_GPIO_OUT_CLR) = 1u;
}

static __attribute__((always_inline)) inline void intent_uart0_text(const char *text)
{
  INTENT_MMIO32(INTENT_UART0_CR) = 0x301u;
  while (*text != '\0') {
    INTENT_MMIO32(INTENT_UART0_DR) = (intent_u32)(intent_u8)*text;
    text++;
  }
  INTENT_MMIO32(INTENT_UART0_DR) = (intent_u32)'\n';
}

static __attribute__((noreturn, always_inline)) inline void intent_halt(void)
{
  for (;;) __asm__ volatile ("nop");
}

#endif
