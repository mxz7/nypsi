import { describe, expect, test } from "vitest";
import type { OrderType } from "#generated/prisma";
import {
  MatchableMarketOrder,
  quoteMarketOrder,
} from "../../src/utils/functions/economy/market/matching";

function order(
  id: number,
  orderType: OrderType,
  price: number,
  itemAmount: number,
  ownerId = `user-${id}`,
  completed = false,
): MatchableMarketOrder {
  return { id, ownerId, itemAmount, price: BigInt(price), orderType, completed };
}

describe("quoteMarketOrder", () => {
  test("matches buys against the lowest sell price then oldest order", () => {
    const orders = [
      order(4, "sell", 90, 2),
      order(3, "sell", 100, 2),
      order(1, "sell", 100, 2),
      order(2, "buy", 80, 10),
    ];

    const quote = quoteMarketOrder(orders, { side: "buy", amount: 5 });

    expect(quote.fills.map(({ order, amount }) => [order.id, amount])).toEqual([
      [4, 2],
      [1, 2],
      [3, 1],
    ]);
    expect(quote.total).toBe(480n);
    expect(quote.filledAmount).toBe(5);
    expect(quote.remainingAmount).toBe(0);
  });

  test("matches sells against the highest buy price then oldest order", () => {
    const orders = [
      order(4, "buy", 110, 2),
      order(3, "buy", 100, 2),
      order(1, "buy", 110, 2),
      order(2, "sell", 120, 10),
    ];

    const quote = quoteMarketOrder(orders, { side: "sell", amount: 5 });

    expect(quote.fills.map(({ order, amount }) => [order.id, amount])).toEqual([
      [1, 2],
      [4, 2],
      [3, 1],
    ]);
    expect(quote.total).toBe(540n);
  });

  test("respects the incoming order's limit price", () => {
    const orders = [order(1, "sell", 90, 2), order(2, "sell", 101, 2)];

    const quote = quoteMarketOrder(orders, {
      side: "buy",
      amount: 4,
      limitPrice: 100n,
    });

    expect(quote.fills.map(({ order }) => order.id)).toEqual([1]);
    expect(quote.filledAmount).toBe(2);
    expect(quote.remainingAmount).toBe(2);
    expect(quote.total).toBe(180n);
  });

  test("does not sell below the incoming order's limit price", () => {
    const orders = [order(1, "buy", 100, 2), order(2, "buy", 99, 2)];

    const quote = quoteMarketOrder(orders, {
      side: "sell",
      amount: 4,
      limitPrice: 100n,
    });

    expect(quote.fills.map(({ order }) => order.id)).toEqual([1]);
    expect(quote.filledAmount).toBe(2);
    expect(quote.remainingAmount).toBe(2);
    expect(quote.total).toBe(200n);
  });

  test("excludes completed and self-owned orders", () => {
    const orders = [
      order(1, "buy", 110, 2, "self"),
      order(2, "buy", 105, 2, "other", true),
      order(3, "buy", 100, 2, "other"),
    ];

    const quote = quoteMarketOrder(orders, {
      side: "sell",
      amount: 4,
      ownerId: "self",
    });

    expect(quote.fills.map(({ order }) => order.id)).toEqual([3]);
    expect(quote.remainingAmount).toBe(2);
  });

  test("does not mutate the candidate order collection", () => {
    const orders = [order(2, "sell", 100, 1), order(1, "sell", 90, 1)];

    quoteMarketOrder(orders, { side: "buy", amount: 2 });

    expect(orders.map(({ id }) => id)).toEqual([2, 1]);
  });

  test.each([0, -1, 1.5, Number.NaN])("rejects invalid amounts: %s", (amount) => {
    expect(() => quoteMarketOrder([], { side: "buy", amount })).toThrow(RangeError);
  });
});
