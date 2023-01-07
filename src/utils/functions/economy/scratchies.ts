import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { percentChance, shuffle } from "../random";
import { getBalance, updateBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { getItems } from "./utils";
import { getXp, updateXp } from "./xp";

export default class ScratchCard {
  private item: Item;
  public area: string[][];
  private member: GuildMember;
  public remainingClicks: number;

  constructor(member: GuildMember, item: Item, area?: string[][]) {
    this.item = item;
    this.member = member;
    this.remainingClicks = item.clicks;

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

  public async clicked(interaction: ButtonInteraction) {
    const [y, x] = interaction.customId.split("-").map((i) => parseInt(i));
    this.area[y][x] += ":x";
    this.remainingClicks--;

    if (this.area[y][x].split(":")[1] === "nothing") return;

    const checkHorizontal = (xCheck = 0, horizontalMatches = 1): boolean => {
      if (horizontalMatches === 3) return true;
      if (x === xCheck) return checkHorizontal(xCheck + 1);
      if (!this.area[y][xCheck].endsWith(":x")) return false;

      if (this.area[y][x].split(":")[1] !== this.area[y][xCheck].split(":")[1]) return false;

      return checkHorizontal(xCheck + 1, horizontalMatches + 1);
    };

    const checkVertical = () => {
      let start = y;

      for (let i = 0; i < 1; i++) {
        if (this.area[start - 1] && this.area[start - 1][x] === this.area[y][x]) {
          start--;
          i--;
        }
      }

      for (let i = start; i < start + 3; i++) {
        if (!this.area[i]) return false;
        if (this.area[i][x] !== this.area[y][x]) return false;
      }

      for (let i = start; i < start + 3; i++) {
        this.area[i][x] += "x";
      }

      return true;
    };

    const giveReward = async () => {
      const clickedType = this.area[y][x].split(":")[0];
      const clickedItem = this.area[y][x].split(":")[1];

      const embed = new CustomEmbed(this.member)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader(`${this.member.user.username}'s ${this.item.name}`);
      if (clickedType === "xp") {
        await updateXp(this.member, (await getXp(this.member)) + parseInt(clickedItem));
        embed.setDescription(`you found **${parseInt(clickedItem).toLocaleString()}**xp!`);
      } else if (clickedType === "money") {
        await updateBalance(this.member, (await getBalance(this.member)) + parseInt(clickedItem));
        embed.setDescription(`you found $**${parseInt(clickedItem).toLocaleString()}**`);
      } else {
        let amount = 1;
        if (clickedItem.includes("gun") || clickedItem.includes("fishing_rod") || clickedItem.includes("pickaxe")) {
          amount = 5;
        }

        await addInventoryItem(this.member, clickedItem, amount);
        embed.setDescription(`you found a ${getItems()[clickedItem].emoji} **${getItems()[clickedItem].name}**!`);
      }

      return interaction.followUp({ embeds: [embed] });
    };

    if (checkHorizontal()) {
      for (let i = 0; i < 3; i++) {
        this.area[y][i] += "x";
      }

      await giveReward();
    } else if (checkVertical()) {
      await giveReward();
    }
  }

  private createScratchArea(item: Item) {
    if (item.role !== "scratch-card") return false;

    let arr: string[][] = [];

    for (let i = 0; i < 5; i++) {
      arr[i] = ["nothing", "nothing", "nothing"];
    }

    const items: `${string}:${string}`[] = [];

    for (const scratchItem of item.items) {
      const type = scratchItem.split(":")[0];
      const value = scratchItem.split(":")[1];
      const chance = scratchItem.split(":")[2];

      if (chance && !percentChance(parseFloat(chance))) continue;

      items.push(`${type}:${value}`);
    }

    let createVert = -1;
    const hCount = Math.floor(Math.random() * 2) + 1;

    for (let i = 0; i < hCount; i++) {
      let pos = Math.floor(Math.random() * 5);

      while (hCount === 1 && pos === 2) {
        pos = Math.floor(Math.random() * 5);
      }

      const item = items[Math.floor(Math.random() * items.length)];
      if ((arr[pos][0] !== "nothing" && pos !== 2) || hCount === 1) createVert = pos;
      arr[pos] = [item, item, item];
    }

    if (createVert !== -1) {
      const item = items[Math.floor(Math.random() * items.length)];
      const x = Math.floor(Math.random() * 3);

      if (createVert > 2) {
        for (let i = 0; i < 3; i++) {
          arr[i][x] = item;
        }
      } else {
        for (let i = 2; i < 5; i++) {
          arr[i][x] = item;
        }
      }
    } else {
      arr = shuffle(arr);
    }

    let nothingCount = 0;

    arr.forEach((arr2) => arr2.forEach((i) => (i === "nothing" ? nothingCount++ : null)));

    for (let i = 0; i < nothingCount + 3; i++) {
      const index = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3)];

      if (arr[index[0]][index[1]] === "nothing") {
        arr[index[0]][index[1]] = item.items[Math.floor(Math.random() * item.items.length)].split(":").slice(0, 2).join(":");
      }
    }

    return arr;
  }
}
