import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, MessageActionRowComponentBuilder } from "discord.js";
import { Item } from "../../../types/Economy";
import { percentChance, shuffle } from "../random";
import { getItems } from "./utils";

export default class ScratchCard {
  private item: Item;
  public area: string[][];
  private member: GuildMember;

  constructor(member: GuildMember, item: Item, area?: string[][]) {
    this.item = item;
    this.member = member;

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

        if (col.endsWith(":xx")) {
          button.setDisabled(true);
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
        } else if (col.endsWith(":x")) {
          button.setDisabled(true);
          button.setStyle(ButtonStyle.Secondary);
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
          button.setDisabled(true);
          if (col.endsWith(":xx")) button.setStyle(ButtonStyle.Success);
          if (col.endsWith(":x")) button.setStyle(ButtonStyle.Secondary);
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
      index[1] = 0;
    }

    return rows;
  }

  public async clicked(buttonId: string) {
    console.log("click");
    const [y, x] = buttonId.split("-").map((i) => parseInt(i));
    console.log(this.area);
    console.log(this.area[y][x]);
    this.area[y][x] += ":x";
    console.log(this.area);
    console.log(y, x);

    if (this.area[y][x].split(":")[1] === "nothing") return;

    const clickedItem = this.area[y][x];

    let horizontalMatches = 1;

    const checkHorizontal = (xCheck = 0): boolean => {
      if (horizontalMatches === 3) return true;
      if (x === xCheck) return checkHorizontal(xCheck + 1);
      if (!this.area[y][xCheck].endsWith(":x")) return false;

      if (this.area[y][x].split(":")[1] !== this.area[y][xCheck].split(":")[1]) return false;

      horizontalMatches++;
      return checkHorizontal(xCheck + 1);
    };

    let verticalMatches = 1;
    let verticalChecks = 1;

    const checkVertical = (yCheck = y - 1, direction: "up" | "down" = "up"): boolean => {
      if (verticalMatches === 3) return true;
      if (verticalChecks === 3) return false;
      if (!this.area[yCheck] && yCheck < y) {
        if (yCheck + 1 === y) return checkVertical(yCheck + 2);
        return checkVertical(yCheck + 1);
      } else if (!this.area[yCheck] && yCheck > y) {
        if (yCheck - 1 === y) return checkVertical(yCheck - 2, "down");
        return checkVertical(yCheck - 1, "down");
      }

      if (this.area[y][x].split(":")[1] !== this.area[yCheck][x].split(":")[1]) return false;

      if (y === yCheck) {
        if (direction === "down") {
          return checkVertical(yCheck - 1, "down");
        } else {
          return checkVertical(yCheck + 1, "up");
        }
      }

      verticalMatches++;
      if (direction === "down") {
        return checkVertical(yCheck - 1, "down");
      } else {
        return checkVertical(yCheck + 1);
      }
    };

    if (checkHorizontal()) {
      for (let i = 0; i < 3; i++) {
        this.area[y][i] += "x";
      }
      console.log("found horizontal match");
    }

    if (checkVertical()) {
      console.log("found vertical match");
    }
  }

  private createScratchArea(item: Item) {
    if (item.role !== "scratch-card") return false;

    let arr: string[][] = [];

    for (let i = 0; i < 5; i++) {
      arr[i] = ["nothing", "nothing", "nothing"];
    }

    // for (let i = 0; i < 12; i++) {
    //   arr[i % 5][i % 3] = clone(item.items)[Math.floor(Math.random() * item.items.length)].split(":").slice(1, 2).join(":");
    // }

    // console.log(arr);

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

    for (let i = 0; i < nothingCount + 3; i++) {
      const index = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3)];

      if (arr[index[0]][index[1]] === "nothing") {
        arr[index[0]][index[1]] = item.items[Math.floor(Math.random() * item.items.length)].split(":").slice(0, 2).join(":");
      }
    }

    console.log(checkBoard(arr, 3));

    return arr;
  }
}
