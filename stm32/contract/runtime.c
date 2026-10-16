// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
#include "intent_stm32_runtime.h"

typedef unsigned int intent_u32;

#define INTENT_REG32(address) (*(volatile intent_u32 *)(address))
#define INTENT_RCC_AHB1ENR INTENT_REG32(0x40023830u)
#define INTENT_RCC_APB1ENR INTENT_REG32(0x40023840u)
#define INTENT_GPIOB_MODER INTENT_REG32(0x40020400u)
#define INTENT_GPIOB_BSRR INTENT_REG32(0x40020418u)
#define INTENT_USART3_DR INTENT_REG32(0x40004804u)
#define INTENT_USART3_CR1 INTENT_REG32(0x4000480cu)

void intent_pb0_output(unsigned int level)
{
  INTENT_RCC_AHB1ENR |= (1u << 1);
  INTENT_GPIOB_MODER = (INTENT_GPIOB_MODER & ~3u) | 1u;
  INTENT_GPIOB_BSRR = level ? 1u : (1u << 16);
}

void intent_usart3_text(const char *text)
{
  INTENT_RCC_APB1ENR |= (1u << 18);
  INTENT_USART3_CR1 = (1u << 13) | (1u << 3);
  while (*text != '\0') {
    INTENT_USART3_DR = (unsigned int)(unsigned char)*text;
    text += 1;
  }
  INTENT_USART3_DR = 10u;
}

__attribute__((noreturn)) void intent_halt(void)
{
  for (;;) { }
}

