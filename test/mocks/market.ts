import type { OrderType } from "#generated/prisma";
import type { MatchableMarketOrder } from "../../src/utils/functions/economy/market/matching";

export function order(
  id: number,
  orderType: OrderType,
  price: number,
  itemAmount: number,
  ownerId = `user-${id}`,
  completed = false,
): MatchableMarketOrder {
  return { id, ownerId, itemAmount, price: BigInt(price), orderType, completed };
}
