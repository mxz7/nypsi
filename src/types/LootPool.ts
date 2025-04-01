export type LootPool = {
  nothing?: number; // weight
  money?: {
    [amount: number]: number // amount: weight
  };
  xp?: {
    [amount: number]: number // amount: weight
  };
  karma?: {
    [amount: number]: number // amount: weight
  };
  items?: {
    [item: string]: LootPoolItemEntry
  };
}

export type LootPoolItemEntry = {
  weight?: number;
  count?: {
    min: number;
    max: number;
  } | number;
} | number // item: weight, count assumed to be 1


export type LootPoolResult = { // describes ONE loot pool drop
  money?: number;
  xp?: number;
  karma?: number;
  item?: string;
  count?: number; // must be present if item is present
}
