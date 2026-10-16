// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
#ifndef INTENT_STM32_RUNTIME_H
#define INTENT_STM32_RUNTIME_H

#ifndef __ASSEMBLER__
void intent_pb0_output(unsigned int level);
void intent_usart3_text(const char *text);
__attribute__((noreturn)) void intent_halt(void);
#endif

#endif
