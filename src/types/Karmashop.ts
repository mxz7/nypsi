type KarmaShopItemBase = {
  name: string;
  emoji: string;
  id: string;
  cost: number;
  items_left: number;
  aliases?: string[];
  bought: string[];
  limit: number;
};

export type KarmaShopItem = KarmaShopItemBase &
  (
    | {
        type: "item" | "premium";
        value: string;
      }
    | {
        type: "xp";
        value: number;
      }
  );
