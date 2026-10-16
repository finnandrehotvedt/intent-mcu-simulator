/* Copyright 2026 IntentForce
 * SPDX-License-Identifier: Apache-2.0
 * Original minimal RP2040 Cortex-M0+ entry point for the private source slice.
 */
.syntax unified
.cpu cortex-m0plus
.thumb

.section .vectors, "a", %progbits
.align 2
.global intent_vector_table
intent_vector_table:
  .word 0x20041000
  .word Reset_Handler

.section .text.Reset_Handler, "ax", %progbits
.align 2
.global Reset_Handler
.type Reset_Handler, %function
.thumb_func
Reset_Handler:
  bl main
1:
  b 1b
.size Reset_Handler, . - Reset_Handler
