import type { Market, Prisma } from "#generated/prisma";
import Constants from "../../../Constants";
import type { MatchableMarketOrder } from "./matching";

export type MarketFillAccounting = {
  restingOrderId: number;
  orderType: MatchableMarketOrder["orderType"];
  itemId: string;
  amount: number;
  price: bigint;
  gross: bigint;
  buyerId: string;
  sellerId: string;
  sellerTax: bigint;
  sellerProceeds: bigint;
  incomingMoneyDebit: bigint;
  incomingItemDebit: number;
  incomingRefund: bigint;
};

type MarketFillRequest = {
  restingOrder: MatchableMarketOrder & { itemId: string };
  incomingUserId: string;
  amount: number;
  taxRate: number;
  sellerTaxExempt: boolean;
  incomingAssetsEscrowed: boolean;
  incomingLimitPrice?: bigint;
};

export type SettledMarketFill = MarketFillAccounting & {
  incomingUserId: string;
  order: Market;
};

type SettleMarketFillRequest = {
  orderId: number;
  incomingUserId: string;
  amount: number;
  taxRate: number;
  sellerTaxExempt: boolean;
  incomingAssetsEscrowed: boolean;
  incomingLimitPrice?: bigint;
  isAlt: boolean;
  seasonInterim: boolean;
};

export class MarketEscrowError extends Error {
  constructor(public readonly reason: "insufficient_balance" | "insufficient_inventory") {
    super(reason);
  }
}

export async function escrowMarketOrderAssets(
  prisma: Prisma.TransactionClient,
  request: {
    amount: number;
    itemId: string;
    orderType: MatchableMarketOrder["orderType"];
    price: bigint;
    userId: string;
  },
) {
  if (request.orderType === "buy") {
    const result = await prisma.economy.update({
      where: { userId: request.userId },
      data: { money: { decrement: request.price * BigInt(request.amount) } },
      select: { money: true },
    });

    if (result.money < 0n) throw new MarketEscrowError("insufficient_balance");
    return;
  }

  const result = await prisma.inventory
    .update({
      where: { userId_item: { userId: request.userId, item: request.itemId } },
      data: { amount: { decrement: request.amount } },
      select: { amount: true },
    })
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === "P2025") {
        throw new MarketEscrowError("insufficient_inventory");
      }

      throw error;
    });

  if (result.amount < 0n) throw new MarketEscrowError("insufficient_inventory");

  if (result.amount === 0n) {
    await prisma.inventory.delete({
      where: { userId_item: { userId: request.userId, item: request.itemId } },
    });
  }
}

/** Calculates the asset movements for one fill at the existing order's price. */
export function calculateMarketFill(request: MarketFillRequest): MarketFillAccounting {
  const { restingOrder, amount } = request;

  if (!Number.isInteger(amount) || amount < 1 || amount > restingOrder.itemAmount) {
    throw new RangeError("market fill amount must fit within the resting order");
  }

  if (!Number.isFinite(request.taxRate) || request.taxRate < 0 || request.taxRate > 1) {
    throw new RangeError("market tax rate must be between zero and one");
  }

  const incomingSide = restingOrder.orderType === "buy" ? "sell" : "buy";
  const buyerId = incomingSide === "buy" ? request.incomingUserId : restingOrder.ownerId;
  const sellerId = incomingSide === "sell" ? request.incomingUserId : restingOrder.ownerId;
  const gross = restingOrder.price * BigInt(amount);
  const sellerTax = request.sellerTaxExempt
    ? 0n
    : BigInt(Math.floor(Number(gross) * request.taxRate));

  let incomingRefund = 0n;

  if (incomingSide === "buy" && request.incomingAssetsEscrowed) {
    if (
      request.incomingLimitPrice === undefined ||
      request.incomingLimitPrice < restingOrder.price
    ) {
      throw new RangeError("escrowed buy fills require a sufficient limit price");
    }

    incomingRefund = (request.incomingLimitPrice - restingOrder.price) * BigInt(amount);
  }

  return {
    restingOrderId: restingOrder.id,
    orderType: restingOrder.orderType,
    itemId: restingOrder.itemId,
    amount,
    price: restingOrder.price,
    gross,
    buyerId,
    sellerId,
    sellerTax,
    sellerProceeds: gross - sellerTax,
    incomingMoneyDebit: incomingSide === "buy" && !request.incomingAssetsEscrowed ? gross : 0n,
    incomingItemDebit: incomingSide === "sell" && !request.incomingAssetsEscrowed ? amount : 0,
    incomingRefund,
  };
}

export async function settleMarketFill(
  prisma: Prisma.TransactionClient,
  request: SettleMarketFillRequest,
): Promise<SettledMarketFill | undefined> {
  const order = await prisma.market.findFirst({
    where: { id: request.orderId, completed: false },
  });

  if (!order || order.itemAmount < request.amount) return;

  const accounting = calculateMarketFill({
    restingOrder: order,
    incomingUserId: request.incomingUserId,
    amount: request.amount,
    taxRate: request.taxRate,
    sellerTaxExempt: request.sellerTaxExempt,
    incomingAssetsEscrowed: request.incomingAssetsEscrowed,
    incomingLimitPrice: request.incomingLimitPrice,
  });

  if (order.itemAmount === request.amount) {
    order.completed = true;

    if (request.isAlt && request.seasonInterim) {
      await prisma.market.delete({ where: { id: order.id } });
    } else {
      await prisma.market.update({ where: { id: order.id }, data: { completed: true } });
    }
  } else {
    if (!request.isAlt && !request.seasonInterim) {
      await prisma.market.create({
        data: {
          itemId: order.itemId,
          orderType: order.orderType,
          ownerId: order.ownerId,
          itemAmount: request.amount,
          price: order.price,
          completed: true,
        },
      });
    }

    await prisma.market.update({
      where: { id: order.id },
      data: { itemAmount: { decrement: request.amount } },
    });
    order.itemAmount -= request.amount;
  }

  if (accounting.incomingMoneyDebit > 0n) {
    const result = await prisma.economy.update({
      where: { userId: request.incomingUserId },
      data: { money: { decrement: accounting.incomingMoneyDebit } },
      select: { money: true },
    });

    if (result.money < 0n) {
      throw new Error(
        `insufficient balance during market settlement: resulting balance ${result.money}`,
      );
    }
  }

  if (accounting.incomingItemDebit > 0) {
    const result = await prisma.inventory.update({
      where: { userId_item: { userId: request.incomingUserId, item: order.itemId } },
      data: { amount: { decrement: accounting.incomingItemDebit } },
      select: { amount: true },
    });

    if (result.amount < 0n) {
      throw new Error(
        `insufficient inventory during market settlement: resulting amount ${result.amount}`,
      );
    }

    if (result.amount === 0n) {
      await prisma.inventory.delete({
        where: { userId_item: { userId: request.incomingUserId, item: order.itemId } },
      });
    }
  }

  await prisma.inventory.upsert({
    where: { userId_item: { userId: accounting.buyerId, item: order.itemId } },
    update: { amount: { increment: accounting.amount } },
    create: { userId: accounting.buyerId, item: order.itemId, amount: accounting.amount },
  });

  await prisma.economy.update({
    where: { userId: accounting.sellerId },
    data: { money: { increment: accounting.sellerProceeds } },
  });

  if (accounting.incomingRefund > 0n) {
    await prisma.economy.update({
      where: { userId: request.incomingUserId },
      data: { money: { increment: accounting.incomingRefund } },
    });
  }

  if (accounting.sellerTax > 0n) {
    await prisma.economy.upsert({
      where: { userId: Constants.BOT_USER_ID },
      update: { bank: { increment: accounting.sellerTax } },
      create: {
        bank: accounting.sellerTax,
        lastVote: new Date(0),
        userId: Constants.BOT_USER_ID,
      },
    });
  }

  return { ...accounting, incomingUserId: request.incomingUserId, order };
}

export async function updateIncomingMarketOrder(
  prisma: Prisma.TransactionClient,
  order: Market,
  filledAmount: number,
  seasonInterim: boolean,
): Promise<number> {
  if (!Number.isInteger(filledAmount) || filledAmount < 1 || filledAmount > order.itemAmount) {
    throw new RangeError("filled amount must fit within the incoming market order");
  }

  const remainingAmount = order.itemAmount - filledAmount;

  if (remainingAmount === 0) {
    if (seasonInterim) await prisma.market.delete({ where: { id: order.id } });
    else await prisma.market.update({ where: { id: order.id }, data: { completed: true } });
  } else {
    await prisma.market.update({
      where: { id: order.id },
      data: { itemAmount: remainingAmount },
    });

    if (order.price > 10_000 && !seasonInterim) {
      await prisma.market.create({
        data: {
          ownerId: order.ownerId,
          itemId: order.itemId,
          itemAmount: filledAmount,
          orderType: order.orderType,
          price: order.price,
          completed: true,
        },
      });
    }
  }

  return remainingAmount;
}
