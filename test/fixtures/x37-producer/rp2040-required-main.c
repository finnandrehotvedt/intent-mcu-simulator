/* Intent MCU Simulator private X37 RP2040 turnaround source v1 */
int main(void)
{
  intent_x37_turnaround_8192();
  intent_uart0_text("X37 TURNAROUND");
  intent_halt();
}
