import { describe, expect, test, vi } from "vitest";
import type { OrderType } from "#generated/prisma";
import {
  MatchableMarketOrder,
  quoteMarketOrder,
} from "../../src/utils/functions/economy/market/matching";
import {
  calculateMarketFill,
  settleMarketFill,
  updateIncomingMarketOrder,
} from "../../src/utils/functions/economy/market/settlement";

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

describe("calculateMarketFill", () => {
  test("refunds an escrowed buyer when a sell order rests below their limit", () => {
    const fill = calculateMarketFill({
      restingOrder: { ...order(1, "sell", 1000, 1, "seller"), itemId: "cookie" },
      incomingUserId: "buyer",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: true,
      incomingLimitPrice: 1300n,
    });

    expect(fill).toMatchObject({
      buyerId: "buyer",
      sellerId: "seller",
      gross: 1000n,
      sellerTax: 50n,
      sellerProceeds: 950n,
      incomingMoneyDebit: 0n,
      incomingRefund: 300n,
    });
    expect(fill.sellerProceeds + fill.sellerTax + fill.incomingRefund).toBe(1300n);
  });

  test("pays an incoming seller the existing buy order's higher price", () => {
    const fill = calculateMarketFill({
      restingOrder: { ...order(1, "buy", 1300, 1, "buyer"), itemId: "cookie" },
      incomingUserId: "seller",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: true,
      incomingLimitPrice: 1000n,
    });

    expect(fill).toMatchObject({
      buyerId: "buyer",
      sellerId: "seller",
      gross: 1300n,
      sellerTax: 65n,
      sellerProceeds: 1235n,
      incomingItemDebit: 0,
      incomingRefund: 0n,
    });
    expect(fill.sellerProceeds + fill.sellerTax).toBe(1300n);
  });

  test("debits available assets for direct market transactions", () => {
    const buy = calculateMarketFill({
      restingOrder: { ...order(1, "sell", 1000, 2, "seller"), itemId: "cookie" },
      incomingUserId: "buyer",
      amount: 2,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: false,
    });
    const sell = calculateMarketFill({
      restingOrder: { ...order(2, "buy", 1300, 2, "buyer"), itemId: "cookie" },
      incomingUserId: "seller",
      amount: 2,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: false,
    });

    expect(buy.incomingMoneyDebit).toBe(2000n);
    expect(buy.incomingItemDebit).toBe(0);
    expect(sell.incomingMoneyDebit).toBe(0n);
    expect(sell.incomingItemDebit).toBe(2);
  });

  test("does not tax an exempt seller", () => {
    const fill = calculateMarketFill({
      restingOrder: { ...order(1, "sell", 1000, 1, "seller"), itemId: "cookie" },
      incomingUserId: "buyer",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: true,
      incomingAssetsEscrowed: false,
    });

    expect(fill.sellerTax).toBe(0n);
    expect(fill.sellerProceeds).toBe(1000n);
  });
});

describe("settleMarketFill", () => {
  function transactionClient(
    restingOrder: MatchableMarketOrder & { itemId: string },
    amounts: { balance?: bigint; inventory?: bigint } = {},
  ) {
    const marketOrder = {
      ...restingOrder,
      messageId: null,
      createdAt: new Date(0),
    };
    const transaction = {
      market: {
        findFirst: vi.fn().mockResolvedValue({ ...marketOrder }),
        delete: vi.fn().mockResolvedValue(marketOrder),
        update: vi.fn().mockResolvedValue(marketOrder),
        create: vi.fn().mockResolvedValue(marketOrder),
      },
      economy: {
        update: vi.fn().mockResolvedValue({ money: amounts.balance ?? 0n }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      inventory: {
        update: vi.fn().mockResolvedValue({ amount: amounts.inventory ?? 0n }),
        delete: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    return transaction;
  }

  test("moves a direct buy's assets through the transaction client", async () => {
    const restingOrder = { ...order(1, "sell", 1000, 1, "seller"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder);

    const fill = await settleMarketFill(transaction as never, {
      orderId: 1,
      incomingUserId: "buyer",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: false,
      isAlt: false,
      seasonInterim: false,
    });

    expect(transaction.economy.update).toHaveBeenCalledWith({
      where: { userId: "buyer" },
      data: { money: { decrement: 1000n } },
      select: { money: true },
    });
    expect(transaction.inventory.upsert).toHaveBeenCalledWith({
      where: { userId_item: { userId: "buyer", item: "cookie" } },
      update: { amount: { increment: 1 } },
      create: { userId: "buyer", item: "cookie", amount: 1 },
    });
    expect(transaction.economy.update).toHaveBeenCalledWith({
      where: { userId: "seller" },
      data: { money: { increment: 950n } },
    });
    expect(transaction.economy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { bank: { increment: 50n } } }),
    );
    expect(fill).toMatchObject({ gross: 1000n, sellerProceeds: 950n, sellerTax: 50n });
  });

  test("refunds an escrowed buyer inside the transaction", async () => {
    const restingOrder = { ...order(1, "sell", 1000, 1, "seller"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder);

    await settleMarketFill(transaction as never, {
      orderId: 1,
      incomingUserId: "buyer",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: true,
      incomingLimitPrice: 1300n,
      isAlt: false,
      seasonInterim: false,
    });

    expect(transaction.economy.update).not.toHaveBeenCalledWith({
      where: { userId: "buyer" },
      data: { money: { decrement: 1000n } },
      select: { money: true },
    });
    expect(transaction.economy.update).toHaveBeenCalledWith({
      where: { userId: "buyer" },
      data: { money: { increment: 300n } },
    });
  });

  test("moves a direct seller's inventory at the resting buy price", async () => {
    const restingOrder = { ...order(1, "buy", 1300, 1, "buyer"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder);

    const fill = await settleMarketFill(transaction as never, {
      orderId: 1,
      incomingUserId: "seller",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: false,
      isAlt: false,
      seasonInterim: false,
    });

    expect(transaction.inventory.update).toHaveBeenCalledWith({
      where: { userId_item: { userId: "seller", item: "cookie" } },
      data: { amount: { decrement: 1 } },
      select: { amount: true },
    });
    expect(transaction.inventory.upsert).toHaveBeenCalledWith({
      where: { userId_item: { userId: "buyer", item: "cookie" } },
      update: { amount: { increment: 1 } },
      create: { userId: "buyer", item: "cookie", amount: 1 },
    });
    expect(transaction.economy.update).toHaveBeenCalledWith({
      where: { userId: "seller" },
      data: { money: { increment: 1235n } },
    });
    expect(fill).toMatchObject({ gross: 1300n, sellerProceeds: 1235n, sellerTax: 65n });
  });

  test("records a partial fill without completing the resting order", async () => {
    const restingOrder = { ...order(1, "sell", 1000, 2, "seller"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder);

    const fill = await settleMarketFill(transaction as never, {
      orderId: 1,
      incomingUserId: "buyer",
      amount: 1,
      taxRate: 0.05,
      sellerTaxExempt: false,
      incomingAssetsEscrowed: false,
      isAlt: false,
      seasonInterim: false,
    });

    expect(transaction.market.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemAmount: 1, completed: true }),
    });
    expect(transaction.market.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { itemAmount: { decrement: 1 } },
    });
    expect(fill?.order.itemAmount).toBe(1);
    expect(fill?.order.completed).toBe(false);
  });

  test("fails settlement when the incoming buyer no longer has enough money", async () => {
    const restingOrder = { ...order(1, "sell", 1000, 1, "seller"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder, { balance: -1n });

    await expect(
      settleMarketFill(transaction as never, {
        orderId: 1,
        incomingUserId: "buyer",
        amount: 1,
        taxRate: 0.05,
        sellerTaxExempt: false,
        incomingAssetsEscrowed: false,
        isAlt: false,
        seasonInterim: false,
      }),
    ).rejects.toThrow("insufficient balance during market settlement");
  });

  test("fails settlement when the incoming seller no longer has enough inventory", async () => {
    const restingOrder = { ...order(1, "buy", 1300, 1, "buyer"), itemId: "cookie" };
    const transaction = transactionClient(restingOrder, { inventory: -1n });

    await expect(
      settleMarketFill(transaction as never, {
        orderId: 1,
        incomingUserId: "seller",
        amount: 1,
        taxRate: 0.05,
        sellerTaxExempt: false,
        incomingAssetsEscrowed: false,
        isAlt: false,
        seasonInterim: false,
      }),
    ).rejects.toThrow("insufficient inventory during market settlement");
  });
});

describe("updateIncomingMarketOrder", () => {
  test("leaves a partially filled remainder and records completed history", async () => {
    const incomingOrder = {
      ...order(10, "buy", 20_000, 5, "buyer"),
      itemId: "cookie",
      messageId: null,
      createdAt: new Date(0),
    };
    const transaction = {
      market: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };

    const remaining = await updateIncomingMarketOrder(
      transaction as never,
      incomingOrder,
      2,
      false,
    );

    expect(remaining).toBe(3);
    expect(transaction.market.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { itemAmount: 3 },
    });
    expect(transaction.market.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemAmount: 2, completed: true }),
    });
    expect(transaction.market.delete).not.toHaveBeenCalled();
  });

  test("deletes a fully filled incoming order during season interim", async () => {
    const incomingOrder = {
      ...order(10, "buy", 20_000, 2, "buyer"),
      itemId: "cookie",
      messageId: null,
      createdAt: new Date(0),
    };
    const transaction = {
      market: {
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };

    const remaining = await updateIncomingMarketOrder(transaction as never, incomingOrder, 2, true);

    expect(remaining).toBe(0);
    expect(transaction.market.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(transaction.market.update).not.toHaveBeenCalled();
  });
});
