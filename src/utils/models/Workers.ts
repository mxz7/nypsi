export interface Worker {
  name: string;
  item_emoji: string;
  prestige_requirement: number;
  cost: number;
  base: {
    per_item: number;
    max_storage: number;
    per_interval: number;
  };
}
