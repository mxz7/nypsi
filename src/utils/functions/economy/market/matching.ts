import type { OrderType } from "#generated/prisma";

export type MatchableMarketOrder = {
  id: number;
  ownerId: string;
  itemAmount: number;
  price: bigint;
  orderType: OrderType;
  completed: boolean;
};

export type MarketOrderFill<T extends MatchableMarketOrder> = {
  order: T;
  amount: number;
  price: bigint;
};

export type MarketOrderQuote<T extends MatchableMarketOrder> = {
  fills: MarketOrderFill<T>[];
  filledAmount: number;
  remainingAmount: number;
  total: bigint;
};

type MarketOrderRequest = {
  side: OrderType;
  amount: number;
  limitPrice?: bigint;
  ownerId?: string;
};

/**
 * Builds a non-mutating quote by filtering eligible opposite-side orders and matching them in
 * price-time priority until the requested amount is filled or available liquidity is exhausted.
 * This only describes potential fills; it does not reserve assets or settle orders.
 */
export function quoteMarketOrder<T extends MatchableMarketOrder>(
  orders: readonly T[],
  request: MarketOrderRequest,
): MarketOrderQuote<T> {
  if (!Number.isInteger(request.amount) || request.amount < 1) {
    throw new RangeError("market order amount must be a positive integer");
  }

  const matchingSide: OrderType = request.side === "buy" ? "sell" : "buy";
  const candidates = orders
    .filter((order) => {
      if (order.completed || order.orderType !== matchingSide) return false;
      if (request.ownerId !== undefined && order.ownerId === request.ownerId) return false;
      if (request.limitPrice === undefined) return true;

      return request.side === "buy"
        ? order.price <= request.limitPrice
        : order.price >= request.limitPrice;
    })
    .sort((a, b) => {
      if (a.price === b.price) return a.id - b.id;

      if (request.side === "buy") return a.price < b.price ? -1 : 1;
      return a.price > b.price ? -1 : 1;
    });

  const fills: MarketOrderFill<T>[] = [];
  let remainingAmount = request.amount;
  let total = 0n;

  for (const order of candidates) {
    const amount = Math.min(order.itemAmount, remainingAmount);

    if (amount < 1) continue;

    fills.push({ order, amount, price: order.price });
    remainingAmount -= amount;
    total += order.price * BigInt(amount);

    if (remainingAmount === 0) break;
  }

  return {
    fills,
    filledAmount: request.amount - remainingAmount,
    remainingAmount,
    total,
  };
}
