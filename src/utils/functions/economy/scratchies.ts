import { randomInt } from "crypto";
import { Item } from "../../../types/Economy";
import { percentChance, shuffle } from "../random";

export class ScratchCard {
  private item: Item;
  public area: string[][];

  constructor(item: Item) {
    this.item = item;

    this.area = this.createScratchArea(this.item) || [];

    return this;
  }

  private createScratchArea(item: Item) {
    if (item.role !== "scratch-card") return false;

    let arr: string[][] = new Array(5).fill(new Array(3).fill("nothing"));

    const items: `${string}:${string}`[] = [];

    for (const scratchItem of item.items) {
      const type = scratchItem.split(":")[0];
      const value = scratchItem.split(":")[1];
      const chance = scratchItem.split(":")[2];

      if (chance && !percentChance(parseFloat(chance))) continue;

      items.push(`${type}:${value}`);
    }

    for (let i = 0; i < 2; i++) {
      const pos = randomInt(5);
      const item = items[randomInt(items.length)];
      arr[pos] = [item, item, item];
    }

    arr = shuffle(arr);

    return arr;
  }
}
