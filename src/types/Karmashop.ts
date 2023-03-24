export type KarmaShopItem = {
  name: string;
  emoji: string;
  id: string;
  cost: number;
  items_left: number;
  aliases: string[];
  type: "item" | "premium" | "xp";
  value: string;
  bought: string[];
  limit: number;
};
