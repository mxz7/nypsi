import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageActionRowComponentBuilder } from "discord.js";
import { Item } from "../../../types/Economy";
import { percentChance, shuffle } from "../random";
import { getItems } from "./utils";

export class ScratchCard {
  private item: Item;
  public area: string[][];

  constructor(item: Item, area?: string[][]) {
    this.item = item;

    this.area = area || this.createScratchArea(this.item) || [];

    return this;
  }

  public getButtons(end = false) {
    const items = getItems();

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

    const index = [0, 0];
    for (const row of this.area) {
      const buttonRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      for (const col of row) {
        const button = new ButtonBuilder().setCustomId(index.join("-"));

        if (col.endsWith(":x")) {
          button.setStyle(ButtonStyle.Success);
          if (col.startsWith("id:")) {
            button.setEmoji(items[col.split(":")[1]].emoji);
          } else if (col.startsWith("xp:")) {
            button.setEmoji("✨");
          } else if (col.startsWith("money:")) {
            button.setEmoji("💰");
          } else {
            button.setLabel("\u200B");
            button.setStyle(ButtonStyle.Danger);
          }
        } else if (end) {
          button.setStyle(ButtonStyle.Secondary);
          if (col.endsWith(":x")) button.setStyle(ButtonStyle.Success);
          if (col.startsWith("id:")) {
            button.setEmoji(items[col.split(":")[1]].emoji);
          } else if (col.startsWith("xp:")) {
            button.setEmoji("✨");
          } else if (col.startsWith("money:")) {
            button.setEmoji("💰");
          } else {
            button.setLabel("\u200B");
            if (col.endsWith(":x")) button.setStyle(ButtonStyle.Danger);
          }
        } else {
          button.setStyle(ButtonStyle.Secondary);
          button.setLabel("\u200B");
        }

        buttonRow.addComponents(button);

        index[1]++;
      }
      rows.push(buttonRow);
      index[0]++;
    }

    return rows;
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
      const pos = Math.floor(Math.random() * 5);
      const item = items[Math.floor(Math.random() * items.length)];
      arr[pos] = [item, item, item];
    }

    arr = shuffle(arr);

    let nothingCount = 0;

    arr.forEach((arr2) => arr2.forEach((i) => (i === "nothing" ? nothingCount++ : null)));

    for (let i = 0; i < nothingCount - 5; i++) {
      const index = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3)];

      if (arr[index[0]][index[1]] === "nothing") {
        arr[index[0]][index[1]] = item.items[Math.floor(Math.random() * item.items.length)].split(":").slice(0, 2).join(":");
      }
    }

    return arr;
  }
}
