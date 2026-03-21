import { Prisma } from "#generated/prisma";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../../init/database";
import redis from "../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage, SendMessage } from "../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import { Item } from "../../../types/Economy";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getUserId, MemberResolvable } from "../member";
import { addInlineNotification } from "../users/notifications";
import { addProgress } from "./achievements";
import { selectItem } from "./inventory";
import {
  topMuseumAmount,
  topMuseumAmountGlobal,
  topMuseumCompletion,
  topMuseumCompletionGlobal,
  topMuseumCompletions,
  topMuseumCompletionsGlobal,
} from "./top";
import { createUser, getItems, userExists } from "./utils";
import ms = require("ms");

type MuseumItem = {
  [itemId: string]: {
    amount: number;
    completedAt: Date | string;
  };
};

type MuseumEntry = {
  itemId: string;
  amount: bigint | number;
  completedAt: Date | string;
};

export class Museum {
  private items: MuseumItem;
  private userId: string;

  constructor(member: MemberResolvable, data?: MuseumItem | MuseumEntry[]) {
    this.userId = getUserId(member);
    this.items = {};

    if (Array.isArray(data)) {
      for (const i of data) {
        this.items[i.itemId] = {
          amount: Number(i.amount),
          completedAt: i.completedAt,
        };
      }
    } else if (data) {
      this.items = data;
    }
  }

  entries(): MuseumEntry[] {
    return Object.entries(this.items).map(([item, data]) => ({
      itemId: item,
      amount: data.amount,
      completedAt: data.completedAt,
    }));
  }

  getItemsInCategory(category: string) {
    const items = getItems();

    return this.entries().filter((item) => items[item.itemId].museum?.category == category);
  }

  count(item: Item): number;
  count(itemId: string): number;
  count(item: Item | string): number {
    const itemId = typeof item === "string" ? item : item.id;
    return Number(this.items[itemId]?.amount ?? 0);
  }

  has(item: Item): boolean;
  has(itemId: string): boolean;
  has(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return (this.items[itemId]?.amount ?? 0) > 0;
  }

  completed(item: Item): boolean;
  completed(itemId: string): boolean;
  completed(item: Item | string): boolean {
    const itemId = typeof item === "string" ? item : item.id;
    return this.completedAt(itemId) != undefined;
  }

  completedAt(item: Item): Date;
  completedAt(itemId: string): Date;
  completedAt(item: Item | string): Date {
    const itemId = typeof item === "string" ? item : item.id;
    return this.items[itemId]?.completedAt ? new Date(this.items[itemId]?.completedAt) : undefined;
  }

  async completedPlacement(item: Item): Promise<number>;
  async completedPlacement(itemId: string): Promise<number>;
  async completedPlacement(item: Item | string): Promise<number> {
    const itemId = typeof item === "string" ? item : item.id;
    if (!this.completed(itemId)) return undefined;

    const cache = await redis.get(
      `${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${this.userId}`,
    );
    if (cache) {
      const parsed: Record<string, number> = JSON.parse(cache);
      return parsed[itemId] || -1;
    }

    const completedItems = Object.entries(this.items)
      .filter(([_, item]) => item.completedAt)
      .map(([id]) => id);

    if (completedItems.length === 0) return null;

    const results = await prisma.$queryRaw<{ itemId: string; placement: number }[]>`
      SELECT "itemId", placement
      FROM (
        SELECT
          "itemId",
          "userId",
          ROW_NUMBER() OVER (
            PARTITION BY "itemId"
            ORDER BY "completedAt" ASC
          ) as placement
        FROM "Museum"
        WHERE "itemId" IN (${Prisma.join(completedItems)})
          AND "completedAt" IS NOT NULL
      ) ranked
      WHERE "userId" = ${this.userId};
    `;

    const placements: Record<string, number> = {};

    for (const row of results) {
      placements[row.itemId] = Number(row.placement);
    }

    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${this.userId}`,
      JSON.stringify(placements),
      "EX",
      ms("3 days") / 1000,
    );

    return placements[itemId] || -1;
  }

  async leaderboardPlacement(item: Item): Promise<number>;
  async leaderboardPlacement(itemId: string): Promise<number>;
  async leaderboardPlacement(item: Item | string): Promise<number> {
    const itemId = typeof item === "string" ? item : item.id;

    const cache = await redis.get(
      `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${itemId}`,
    );
    if (cache) {
      const parsed: Record<string, number> = JSON.parse(cache);
      return parsed[this.userId];
    }

    const results = await prisma.$queryRaw<{ userId: string; placement: number }[]>`
      SELECT "userId", placement
      FROM (
          SELECT
            "userId",
            RANK() OVER (
              PARTITION BY "itemId"
              ORDER BY "amount" DESC
            ) AS placement
          FROM "Museum"
          WHERE "itemId" = ${itemId}
        ) ranked;
    `;

    const placements: Record<string, number> = {};

    for (const row of results) {
      placements[row.userId] = Number(row.placement);
    }

    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${itemId}`,
      JSON.stringify(placements),
      "EX",
      ms("1 day") / 1000,
    );

    return placements[this.userId];
  }

  async getFavoritedItems() {
    const items = getItems();

    const res = await prisma.museum
      .findMany({
        where: {
          userId: this.userId,
          favorited: { not: null },
        },
        select: {
          itemId: true,
        },
        orderBy: {
          favorited: "asc",
        },
      })
      .then((i) => i.map((i) => items[i.itemId]));

    return res;
  }

  async setFavoritedItems(items: Item[]) {
    const filtered = items.filter(Boolean);

    await prisma.$transaction([
      prisma.museum.updateMany({
        where: {
          userId: this.userId,
          favorited: { not: null },
        },
        data: {
          favorited: null,
        },
      }),
      ...filtered.map((item, i) =>
        prisma.museum.update({
          where: {
            userId_itemId: {
              userId: this.userId,
              itemId: item.id,
            },
          },
          data: {
            favorited: i,
          },
        }),
      ),
    ]);
  }

  toJSON(): MuseumItem {
    return this.items;
  }
}

export async function getMuseum(member: MemberResolvable): Promise<Museum> {
  const userId = getUserId(member);

  const cache = await redis.get(`${Constants.redis.cache.economy.MUSEUM}:${userId}`);

  if (cache) {
    try {
      const parsed: MuseumEntry[] = JSON.parse(cache);
      return new Museum(member, parsed);
    } catch (e) {
      console.error(e);
      logger.error("weird museum cache error", { error: e });
      return new Museum(member);
    }
  }

  const query = await prisma.museum
    .findMany({
      where: {
        userId,
      },
      select: {
        itemId: true,
        amount: true,
        completedAt: true,
      },
    })
    .catch(() => {});

  if (!query || query.length == 0) {
    if (!(await userExists(userId))) await createUser(userId);
    await redis.set(
      `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
      JSON.stringify({}),
      "EX",
      180,
    );
    return new Museum(member);
  }

  const museum = new Museum(member, query);

  await redis.set(
    `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
    JSON.stringify(museum.toJSON()),
    "EX",
    180,
  );

  return museum;
}

export async function addToMuseum(member: MemberResolvable, itemId: string, amount: number) {
  const userId = getUserId(member);

  if (amount <= 0) return;

  if (!(await userExists(userId))) await createUser(userId);

  const item = getItems()[itemId];

  if (!item || !item.museum) {
    console.trace();
    return logger.error(`museum: invalid item ${itemId}`);
  }

  const now = new Date();

  const res = await prisma.museum.upsert({
    where: {
      userId_itemId: {
        userId,
        itemId,
      },
    },
    update: {
      amount: { increment: amount },
      breakdown: {
        create: {
          amount,
          createdAt: now,
        },
      },
    },
    create: {
      userId,
      itemId,
      amount: amount,
      breakdown: {
        create: {
          amount,
          createdAt: now,
        },
      },
    },
    select: {
      amount: true,
      completedAt: true,
    },
  });

  if (!res.completedAt && res.amount >= item.museum.threshold) {
    await prisma.museum.update({
      where: {
        userId_itemId: {
          userId,
          itemId,
        },
      },
      data: {
        completedAt: now,
      },
    });
    await redis.del(`${Constants.redis.cache.economy.MUSEUM_COMPLETION_PLACEMENTS}:${userId}`);
    addProgress(member, "artifact_discoverer", 1);
    addInlineNotification({
      memberId: userId,
      embed: new CustomEmbed(
        userId,
        `you have completed the ${item.emoji} **${item.name}** museum item!!`,
      ),
    });
  }

  await redis.del(
    `${Constants.redis.cache.economy.MUSEUM_LEADERBOARD_PLACEMENTS}:${itemId}`,
    `${Constants.redis.cache.economy.MUSEUM}:${userId}`,
  );
}

export function getMuseumCategories() {
  return [
    "home",
    ...new Set(
      Object.values(getItems())
        .map((item) => item.museum?.category)
        .filter(Boolean)
        .sort(),
    ),
  ];
}

export async function showMuseumLeaderboard(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  const global = args[2]?.toLowerCase() === "global";

  if (args[1].toLowerCase().startsWith("completion")) {
    return showMuseumCompletionLeaderboard(message, send, global);
  }

  if (args[1].toLowerCase() == "item") args.shift();

  const selected = selectItem(args[1].toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
  }

  if (!selected.museum) {
    return send({ embeds: [new ErrorEmbed(`that item is not in the museum`)] });
  }

  let data: { pages: Map<number, string[]>; pos: number };

  if (global) {
    data = !selected.museum.no_overflow
      ? await topMuseumAmountGlobal(selected.id, message.member)
      : await topMuseumCompletionGlobal(selected.id, message.member);
  } else {
    data = !selected.museum.no_overflow
      ? await topMuseumAmount(message.guild, selected.id, message.member)
      : await topMuseumCompletion(message.guild, selected.id, message.member);
  }

  let amountLeaderboardShown = !selected.museum.no_overflow;
  let currentPage = 1;

  const embed = () => {
    const embed = new CustomEmbed(message.member).setHeader(
      `top ${selected.name} museum ${amountLeaderboardShown ? "quantity" : "completion time"} ${global ? "[global]" : `for ${message.guild.name}`}`,
    );

    if (data.pages.size == 0) {
      embed.setDescription("no data to show");
    } else {
      embed.setDescription(data.pages.get(currentPage).join("\n"));
    }

    if (data.pos != 0) {
      embed.setFooter({ text: `you are #${data.pos}` });
    }

    return embed;
  };

  const rows = (disabled = false) => [
    ...(selected.museum.no_overflow
      ? []
      : [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("amount")
              .setLabel("amount")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(disabled || amountLeaderboardShown),
            new ButtonBuilder()
              .setCustomId("comp")
              .setLabel("completion time")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(disabled || !amountLeaderboardShown),
          ),
        ]),

    ...(data.pages.size <= 1
      ? []
      : [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage <= 1),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage >= data.pages.size),
          ),
        ]),
  ];

  if (
    data.pos === 1 &&
    message instanceof Message &&
    !(await redis.exists(`nypsi:cd:topemoji:${message.channelId}`))
  ) {
    await redis.set(`nypsi:cd:topemoji:${message.channelId}`, "boobies", "EX", 3);
    message.react("👑");
  }

  const msg = await send({
    embeds: [embed()],
    components: rows(),
  });

  if (data.pages.size == 1 && selected.museum.no_overflow) return;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager: any = async () => {
    let fail = false;

    const response = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate().catch(() => {
          fail = true;
          return pageManager();
        });
        return { res: collected.customId, interaction: collected };
      })
      .catch(async () => {
        fail = true;
        await msg.edit({ components: rows(true) });
      });

    if (fail) return;
    if (!response) return;

    const { res } = response;
    if (res == "⬅") {
      if (currentPage > 1) currentPage--;
    } else if (res == "➡") {
      if (currentPage < data.pages.size) currentPage++;
    } else if (res == "comp" || res == "amount") {
      if (global) {
        data =
          res == "amount"
            ? await topMuseumAmountGlobal(selected.id, message.member)
            : await topMuseumCompletionGlobal(selected.id, message.member);
      } else {
        data =
          res == "amount"
            ? await topMuseumAmount(message.guild, selected.id, message.member)
            : await topMuseumCompletion(message.guild, selected.id, message.member);
      }

      amountLeaderboardShown = res == "amount";
      currentPage = 1;
    }

    await msg.edit({ embeds: [embed()], components: rows() });
    return pageManager();
  };

  return pageManager();
}

async function showMuseumCompletionLeaderboard(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  global: boolean,
) {
  const data = global
    ? await topMuseumCompletionsGlobal(message.member)
    : await topMuseumCompletions(message.guild, message.member);

  let viewPercent = true;
  let currentPage = 1;

  const embed = () => {
    const embed = new CustomEmbed(message.member).setHeader(
      `top museum completion ${global ? "[global]" : `for ${message.guild.name}`}`,
    );

    if (getPages().size == 0) {
      embed.setDescription("no data to show");
    } else {
      embed.setDescription(getPages().get(currentPage).join("\n"));
    }

    const totalItems = Object.values(getItems()).filter((i) => i.museum).length;

    if (data.pos != 0) {
      embed.setFooter({
        text: `you are #${data.pos}${
          !viewPercent ? ` | ${totalItems.toLocaleString()} possible` : ""
        }`,
      });
    } else if (!viewPercent) {
      embed.setFooter({
        text: `${totalItems.toLocaleString()} possible`,
      });
    }

    return embed;
  };

  const getPages = () => {
    return viewPercent ? data.percentPages : data.amountPages;
  };

  const rows = (disabled = false) => [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("percent")
        .setLabel("percent")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || viewPercent),
      new ButtonBuilder()
        .setCustomId("amount")
        .setLabel("amount")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || !viewPercent),
    ),

    ...(getPages().size <= 1
      ? []
      : [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage <= 1),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled || currentPage >= getPages().size),
          ),
        ]),
  ];

  if (
    data.pos === 1 &&
    message instanceof Message &&
    !(await redis.exists(`nypsi:cd:topemoji:${message.channelId}`))
  ) {
    await redis.set(`nypsi:cd:topemoji:${message.channelId}`, "boobies", "EX", 3);
    message.react("👑");
  }

  const msg = await send({
    embeds: [embed()],
    components: rows(),
  });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager: any = async () => {
    let fail = false;

    const response = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate().catch(() => {
          fail = true;
          return pageManager();
        });
        return { res: collected.customId };
      })
      .catch(async () => {
        fail = true;
        await msg.edit({ components: rows(true) });
      });

    if (fail) return;
    if (!response) return;

    const { res } = response;
    if (res == "⬅") {
      if (currentPage > 1) currentPage--;
    } else if (res == "➡") {
      if (currentPage < getPages().size) currentPage++;
    } else if (res == "percent" || res == "amount") {
      viewPercent = res == "percent";
      currentPage = 1;
    }

    await msg.edit({ embeds: [embed()], components: rows() });
    return pageManager();
  };

  return pageManager();
}
