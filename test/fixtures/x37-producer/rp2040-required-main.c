/* Intent MCU Simulator private X37 RP2040 reflect source v1 */
int main(void)
{
  intent_gpio0_reflect_gpio1_4096();
  intent_uart0_text("X37 REFLECT");
  intent_halt();
}
