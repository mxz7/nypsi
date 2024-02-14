import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  GuildMember,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../../../init/redis";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import { addToGuildXP, getGuildName } from "../../../utils/functions/economy/guilds";
import Constants from "../../Constants";
import { addKarma } from "../karma/karma";
import { percentChance, shuffle } from "../random";
import { addProgress } from "./achievements";
import { getBalance, updateBalance } from "./balance";
import { addInventoryItem } from "./inventory";
import { addStat } from "./stats";
import { addTaskProgress } from "./tasks";
import { getItems } from "./utils";
import { getXp, updateXp } from "./xp";
import ms = require("ms");

export default class ScratchCard {
  private item: Item;
  public area: string[][];
  private member: GuildMember;
  public remainingClicks: number;
  public won: boolean;

  constructor(member: GuildMember, item: Item) {
    this.item = item;
    this.member = member;
    this.remainingClicks = item.clicks;
    this.won = false;

    return this;
  }

  public async setArea(area?: string[][]) {
    this.area = area || (await this.createScratchArea(this.item)) || [];

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
          } else if (col.startsWith("karma:")) {
            button.setEmoji("🔮");
          } else {
            button.setLabel("\u200B");
            button.setStyle(ButtonStyle.Danger);
          }
        } else if (col.endsWith(":x")) {
          button.setDisabled(true);
          button.setStyle(ButtonStyle.Secondary);
          if (end) button.setStyle(ButtonStyle.Danger);
          if (col.startsWith("id:")) {
            button.setEmoji(items[col.split(":")[1]].emoji);
          } else if (col.startsWith("xp:")) {
            button.setEmoji("✨");
          } else if (col.startsWith("money:")) {
            button.setEmoji("💰");
          } else if (col.startsWith("karma:")) {
            button.setEmoji("🔮");
          } else {
            button.setLabel("\u200B");
            button.setStyle(ButtonStyle.Danger);
          }
        } else if (end) {
          button.setStyle(ButtonStyle.Secondary);
          button.setDisabled(true);
          if (col.endsWith(":xx")) button.setStyle(ButtonStyle.Success);
          if (col.endsWith(":x")) button.setStyle(ButtonStyle.Danger);
          if (col.startsWith("id:")) {
            button.setEmoji(items[col.split(":")[1]].emoji);
          } else if (col.startsWith("xp:")) {
            button.setEmoji("✨");
          } else if (col.startsWith("money:")) {
            button.setEmoji("💰");
          } else if (col.startsWith("karma:")) {
            button.setEmoji("🔮");
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

    if (this.area[y][x].includes("nothing")) return;

    const checkHorizontal = (xCheck = 0, horizontalMatches = 1): boolean => {
      if (horizontalMatches === 3) return true;
      if (x === xCheck) return checkHorizontal(xCheck + 1, horizontalMatches);
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
      await addProgress(this.member.user.id, "scratchies_pro", 1);
      await addTaskProgress(this.member.user.id, "scratch_cards");
      this.won = true;
      const clickedType = this.area[y][x].split(":")[0];
      const clickedItem = this.area[y][x].split(":")[1];
      if (clickedItem.includes("_gem")) await addProgress(this.member.user.id, "gem_hunter", 1);

      const embed = new CustomEmbed(this.member)
        .setColor(Constants.EMBED_SUCCESS_COLOR)
        .setHeader(
          `${this.member.user.username}'s ${this.item.name}`,
          this.member.user.avatarURL(),
        );
      if (clickedType === "xp") {
        await updateXp(this.member, (await getXp(this.member)) + parseInt(clickedItem));
        embed.setDescription(`you found **${parseInt(clickedItem).toLocaleString()}**xp!`);
        const guild = await getGuildName(this.member);
        if (guild) await addToGuildXP(guild, parseInt(clickedItem), this.member);
      } else if (clickedType === "money") {
        await updateBalance(this.member, (await getBalance(this.member)) + parseInt(clickedItem));
        addStat(this.member, "earned-scratch", parseInt(clickedItem));
        embed.setDescription(`you found $**${parseInt(clickedItem).toLocaleString()}**`);
      } else if (clickedType === "karma") {
        await addKarma(this.member, parseInt(clickedItem));
        embed.setDescription(`you found **${parseInt(clickedItem).toLocaleString()}** karma 🔮`);
      } else {
        let amount = 1;
        if (
          clickedItem.includes("gun") ||
          clickedItem.includes("fishing_rod") ||
          clickedItem.includes("pickaxe")
        ) {
          amount = 5;
        }

        if (clickedItem.includes("_gem")) {
          await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
          await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
        }

        await addInventoryItem(this.member, clickedItem, amount);
        embed.setDescription(
          `you found ${getItems()[clickedItem].article} ${getItems()[clickedItem].emoji} **${
            getItems()[clickedItem].name
          }**!`,
        );
      }

      setTimeout(() => {
        interaction.followUp({ embeds: [embed] }).catch(() => {});
      }, 500);
      return;
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

  private async createScratchArea(item: Item) {
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

      if (value.includes("_gem") && (await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) continue;

      items.push(`${type}:${value}`);
    }

    let totalCount = 2;
    let createVert = -1;

    if (item.buy) {
      totalCount = 1;

      if (percentChance(50)) {
        totalCount = 0;
        createVert = Math.floor(Math.random() * 4);
      }
    }

    if (item.id.includes("legendary")) totalCount = 3;
    const hCount = Math.floor(Math.random() * totalCount) + 1;

    for (let i = 0; i < hCount; i++) {
      let pos = Math.floor(Math.random() * 5);

      while (hCount === 1 && pos === 2 && createVert != -1) {
        pos = Math.floor(Math.random() * 5);
      }

      const item = items[Math.floor(Math.random() * items.length)];
      if ((arr[pos][0] !== "nothing" && pos !== 2) || hCount === 1) createVert = pos;
      arr[pos] = [item, item, item];
    }

    if (createVert !== -1 && totalCount !== 1) {
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

    for (let i = 0; i < nothingCount + 7; i++) {
      const index = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3)];

      if (arr[index[0]][index[1]] === "nothing") {
        arr[index[0]][index[1]] = item.items[Math.floor(Math.random() * item.items.length)]
          .split(":")
          .slice(0, 2)
          .join(":");
      }
    }

    return arr;
  }
}
