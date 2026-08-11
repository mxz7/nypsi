const MAX_EXPECTED_SUPERDRAW_TICKETS = 5_000;
const MAX_CHANCE = 0.1;
const REFERENCE_CHANCE = 0.025;
const REFERENCE_TICKET_AMOUNT = 1_000;
const CURVE_SHAPE = 2.63;
const CURVE_EXPONENT = 0.162;
const CURVE_SCALE = Math.pow(MAX_CHANCE / REFERENCE_CHANCE, 1 / CURVE_EXPONENT) - 1;

export function getSuperdrawChance(ticketAmount: number): number {
  if (ticketAmount <= 0) return 0;

  const normalizedTickets = (ticketAmount - 1) / (REFERENCE_TICKET_AMOUNT - 1);

  return (
    MAX_CHANCE *
    Math.pow(1 + CURVE_SCALE * Math.pow(normalizedTickets, CURVE_SHAPE), -CURVE_EXPONENT)
  );
}

export function getSuperdrawChanceMultiplier(ticketAmounts: number[]): number {
  const expectedTickets = ticketAmounts.reduce(
    (total, amount) => total + amount * getSuperdrawChance(amount),
    0,
  );

  if (expectedTickets <= MAX_EXPECTED_SUPERDRAW_TICKETS) return 1;

  return MAX_EXPECTED_SUPERDRAW_TICKETS / expectedTickets;
}
