// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
.syntax unified
.cpu cortex-m4
.thumb

.section .isr_vector,"a",%progbits
.align 2
.global intent_vector_table
intent_vector_table:
  .word 0x20030000
  .word Reset_Handler
  .rept 14
  .word Default_Handler
  .endr

.section .text.Reset_Handler,"ax",%progbits
.align 2
.global Reset_Handler
.type Reset_Handler,%function
.thumb_func
Reset_Handler:
  bl main
  bl intent_halt
.size Reset_Handler, . - Reset_Handler

.section .text.Default_Handler,"ax",%progbits
.align 2
.global Default_Handler
.type Default_Handler,%function
.thumb_func
Default_Handler:
  b Default_Handler
.size Default_Handler, . - Default_Handler

