import ms = require("ms");
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildTextBasedChannel,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed, ErrorEmbed } from "../../models/EmbedBuilders";
import { LootPoolResult } from "../../types/LootPool";
import Constants from "../../utils/Constants";
import { findChannelCluster } from "../../utils/functions/clusters";
import { MStoTime } from "../../utils/functions/date";
import { addProgress } from "../../utils/functions/economy/achievements";
import { itemExists } from "../../utils/functions/economy/inventory";
import {
  describeLootPoolResult,
  giveLootPoolResult,
  rollLootPool,
} from "../../utils/functions/economy/loot_pools";
import { addTaskProgress } from "../../utils/functions/economy/tasks";
import {
  createUser,
  getItems,
  getLootPools,
  isEcoBanned,
  userExists,
} from "../../utils/functions/economy/utils";
import { getPrefix } from "../../utils/functions/guilds/utils";
import { percentChance, shuffle } from "../../utils/functions/random";
import sleep from "../../utils/functions/sleep";
import { getZeroWidth } from "../../utils/functions/string";
import { getLastKnownUsername } from "../../utils/functions/users/tag";
import { createProfile, hasProfile } from "../../utils/functions/users/utils";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");
import pAll = require("p-all");

const max = 3;
const cooldownSeconds = 900;
const activityWithinSeconds = 20;
const activeUsersRequired = 2;
const words = [
  "nypsi",
  "nypsi best discord bot",
  "{prefix}boob",
  "{prefix}pp",
  "{prefix}bake",
  "{prefix}slots all",
  "{prefix}height",
  "{prefix}findamilf",
  "{prefix}cat",
  "{prefix}dog",
  "meow",
];

function doRandomDrop(client: NypsiClient) {
  const rand = Math.floor(Math.random() * ms("10 minutes") + ms("3 minutes"));
  setTimeout(() => {
    randomDrop(client);
    doRandomDrop(client);
  }, rand);
  logger.info(`::auto next random drops will occur in ${MStoTime(rand)}`);
}

export default async function startRandomDrops(client: NypsiClient) {
  doRandomDrop(client);
}

async function getChannels() {
  const query = await prisma.activeChannels.findMany({
    where: {
      date: { gte: dayjs().subtract(activityWithinSeconds, "seconds").toDate() },
    },
  });

  await prisma.activeChannels.deleteMany();

  const channels: { channelId: string; users: number }[] = [];

  for (const i of query) {
    const index = channels.findIndex((j) => j.channelId === i.channelId);
    if (index > -1) {
      channels[index].users++;
    } else {
      channels.push({ channelId: i.channelId, users: 1 });
    }
  }

  return channels
    .filter((i) => i.users >= activeUsersRequired || percentChance(5))
    .map((i) => i.channelId);
}

async function randomDrop(client: NypsiClient) {
  const channels = await getChannels();

  if (
    channels.length === 0 ||
    (await redis.get("nypsi:maintenance")) ||
    (await redis.get(`${Constants.redis.nypsi.RESTART}:${client.cluster.id}`)) == "t"
  )
    return;

  let count = 0;

  const functions = [];

  for (const channelId of shuffle(channels)) {
    functions.push(async () => {
      if (await redis.exists(`nypsi:lootdrop:channel:cd:${channelId}`)) return;
      if (count >= max) return;

      count++;

      await redis.set(`nypsi:lootdrop:channel:cd:${channelId}`, "69", "EX", cooldownSeconds);

      const pool = getLootPools().random_drop;
      const prize = await rollLootPool(
        pool,
        async (e) => getItems()[e].unique && (await itemExists(e)),
      );

      const games = [fastClickGame, clickSpecificGame, typeFastGame];

      logger.info(`random drop started in ${channelId}`);
      const winner = await games[Math.floor(Math.random() * games.length)](
        client,
        channelId,
        prize,
      );

      if (winner) {
        if (!(await hasProfile(winner))) await createProfile(winner);
        if (!(await userExists(winner))) await createUser(winner);
        if ((await isEcoBanned(winner).catch(() => ({ banned: false }))).banned) return;

        logger.info(
          `random drop in ${channelId} winner: ${winner} (${await getLastKnownUsername(
            winner,
            false,
          )}) prize: ${JSON.stringify(prize)}`,
        );
        giveLootPoolResult(winner, prize);
        addProgress(winner, "lootdrops_pro", 1);
        addTaskProgress(winner, "lootdrops");
      }

      if (count >= max) return;
    });
  }

  await pAll(functions, { concurrency: 2 });
}

async function fastClickGame(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
) {
  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(`first to click the button wins ${describeLootPoolResult(prize)}`);
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(`you've won ${describeLootPoolResult(prize)}`);

  if (rain) {
    embed.setFooter({ text: `${rain}'s rain` });
    winEmbed.setFooter({ text: `${rain}'s rain` });
  }

  const buttonId = randomUUID();

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buttonId).setLabel("click me").setStyle(ButtonStyle.Success),
  );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, row, channelId, cluster, buttonId, winEmbed, bannedEmbed }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isSendable()) return;

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const path = await import("path");

      const { logger } = await import(path.join(process.cwd(), "dist", "utils", "logger.js"));

      try {
        const { isEcoBanned } = await import(
          path.join(process.cwd(), "dist", "utils", "functions", "economy", "utils.js")
        );

        const started = Date.now();
        const res = await msg
          .awaitMessageComponent({
            filter: async (i) => {
              try {
                if ((await isEcoBanned(i.user.id)).banned) {
                  i.reply({ embeds: [bannedEmbed], flags: 64 });
                  return false;
                }
              } catch (err) {
                logger.error(
                  `lootdrop: failed to check for ecoban on user ${i.user.id} in fastClick`,
                  {
                    err,
                  },
                );
                return i.customId === buttonId;
              }
              return i.customId === buttonId;
            },
            time: 30000,
          })
          .catch((err) => logger.error("lootdrop: awaitInteraction failed in fastClick", { err }));

        row.components.forEach((b) => (b.disabled = true));

        if (!res) {
          embed.description += "\n\nnobody clicked the button in time 😢";

          await msg.edit({ embeds: [embed], components: [row] });
          return;
        }

        embed.description += `\n\n**${res.user.username.replaceAll("_", "\\_")}** has won in \`${(
          (Date.now() - started) /
          1000
        ).toFixed(2)}s\`!!`;

        res
          .update({ embeds: [embed], components: [row] })
          .then(() => res.followUp({ embeds: [winEmbed], flags: 64 }));

        return res.user.id;
      } catch (err) {
        logger.error("lootdrop: fastClick error", { err });

        embed.description +=
          "\n\nsomething went wrong with this lootdrop, please make a support ticket";

        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }
    },
    {
      context: {
        embed,
        row,
        channelId,
        cluster: cluster.cluster,
        buttonId,
        winEmbed,
        bannedEmbed: new ErrorEmbed("you're banned don't even try loser"),
      },
    },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function typeFastGame(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
) {
  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const chosenWord = words[Math.floor(Math.random() * words.length)].replace(
    `{prefix}`,
    (await getPrefix(cluster.guildId))[0],
  );

  let displayWord = chosenWord;

  const zeroWidthCount = chosenWord.length / 2;

  for (let i = 0; i < zeroWidthCount; i++) {
    const pos = Math.floor(Math.random() * chosenWord.length + 1);

    displayWord = displayWord.substring(0, pos) + getZeroWidth() + displayWord.substring(pos);
  }

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(`first to type \`${displayWord}\` wins ${describeLootPoolResult(prize)}`);

  if (rain) {
    embed.setFooter({ text: `${rain}'s rain` });
  }

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, channelId, cluster, chosenWord }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isSendable()) return;

      const msg = await channel.send({ embeds: [embed] });

      const path = await import("path");

      const { logger } = await import(path.join(process.cwd(), "dist", "utils", "logger.js"));

      try {
        const { isEcoBanned } = await import(
          path.join(process.cwd(), "dist", "utils", "functions", "economy", "utils.js")
        );

        const started = Date.now();
        const res = await channel
          .awaitMessages({
            filter: async (m) => {
              try {
                if ((await isEcoBanned(m.member.id)).banned) {
                  return false;
                }
              } catch (err) {
                logger.error(
                  `lootdrop: failed to check for ecoban on user ${m.member.id} in typeFast`,
                  {
                    err,
                  },
                );
                return m.content.toLowerCase() === chosenWord.toLowerCase();
              }
              return m.content.toLowerCase() === chosenWord.toLowerCase();
            },
            time: 30000,
            max: 1,
          })
          .then((m) => m.first())
          .catch((err) => logger.error("lootdrop: awaitMessages failed in typeFast", { err }));

        if (!res) {
          embed.description += "\n\nnobody won 😢";

          await msg.edit({ embeds: [embed] });
          return;
        }

        embed.description += `\n\n**${res.author.username.replaceAll("_", "\\_")}** has won in \`${(
          (Date.now() - started) /
          1000
        ).toFixed(2)}s\`!!`;

        res.react("🏆");
        await msg.edit({ embeds: [embed] });

        return res.author.id;
      } catch (err) {
        logger.error("lootdrop: typeFast error", { err });

        embed.description +=
          "\n\nsomething went wrong with this lootdrop, please make a support ticket";

        await msg.edit({ embeds: [embed] });
        return;
      }
    },
    { context: { embed, channelId, cluster: cluster.cluster, chosenWord } },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function clickSpecificGame(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
) {
  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const types = [
    {
      type: "colour",
      values: [
        { name: "red", label: "" },
        { name: "blue", label: "" },
        { name: "green", label: "" },
        { name: "gray", label: "" },
      ],
    },
    {
      type: "emoji1",
      values: [
        { name: "laughing", label: "😂" },
        { name: "yum", label: "😋" },
        { name: "drooling", label: "🤤" },
        { name: "kissing", label: "😘" },
        { name: "sad", label: "☹️" },
      ],
    },
    {
      type: "emoji2",
      values: [
        { name: "angry", label: "😡" },
        { name: "shocked", label: "😮" },
        { name: "rich", label: "🤑" },
        { name: "cowboy", label: "🤠" },
        { name: "angel", label: "😇" },
      ],
    },
    {
      type: "emoji3",
      values: [
        { name: "angry", label: "😡" },
        { name: "cheeky", label: "🤭" },
        { name: "yummy", label: "😋" },
        { name: "heart", label: "🫶" },
        { name: "kissing", label: "😘" },
      ],
    },
    {
      type: "emoji4",
      values: [
        { name: "cheeky", label: "🤭" },
        { name: "white heart", label: "🤍" },
        { name: "bubbles", label: "🫧" },
        { name: "loved", label: "🥰" },
        { name: "eye rolling", label: "🙄" },
      ],
    },
    {
      type: "emoji5",
      values: [
        { name: "heart", label: "🫶" },
        { name: "sad", label: "😔" },
        { name: "spicy", label: "🌶️" },
        { name: "happy", label: "😃" },
        { name: "eye rolling", label: "🙄" },
      ],
    },
  ];

  const chosenType = types[Math.floor(Math.random() * types.length)];
  const chosenValue = chosenType.values[Math.floor(Math.random() * chosenType.values.length)];

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(
      `first to click the **${chosenValue.name}** ${
        chosenType.type.includes("emoji") ? "emoji" : "button"
      } wins ${describeLootPoolResult(prize)}`,
    );
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(`you've won ${describeLootPoolResult(prize)}`);
  const failEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setHeader(`uh oh ):`)
    .setDescription(
      `you clicked the wrong ${
        chosenType.type.includes("emoji") ? "emoji" : "button"
      }!! you had to click the **${chosenValue.name}** ${
        chosenType.type.includes("emoji") ? "emoji" : "button"
      }`,
    );

  if (rain) {
    embed.setFooter({ text: `${rain}'s rain` });
    winEmbed.setFooter({ text: `${rain}'s rain` });
    failEmbed.setFooter({ text: `${rain}'s rain` });
  }

  const ids = [];
  while (ids.length < 5) ids.push(randomUUID());

  let winningId: string;

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  for (const i of shuffle(chosenType.values)) {
    const id = ids.shift();

    if (i.name === chosenValue.name) winningId = id;

    const button = new ButtonBuilder().setCustomId(id);

    if (chosenType.type.includes("emoji")) {
      button.setEmoji(i.label);
      button.setStyle(ButtonStyle.Secondary);
    } else {
      button.setLabel(getZeroWidth());
      switch (i.name) {
        case "red":
          button.setStyle(ButtonStyle.Danger);
          break;
        case "blue":
          button.setStyle(ButtonStyle.Primary);
          break;
        case "gray":
          button.setStyle(ButtonStyle.Secondary);
          break;
        case "green":
          button.setStyle(ButtonStyle.Success);
          break;
      }
    }

    row.addComponents(button);
  }

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, row, channelId, cluster, winningId, winEmbed, failEmbed, bannedEmbed }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isSendable()) return;

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const path = await import("path");

      const { logger } = await import(path.join(process.cwd(), "dist", "utils", "logger.js"));

      try {
        const { isEcoBanned } = await import(
          path.join(process.cwd(), "dist", "utils", "functions", "economy", "utils.js")
        );

        const losers: string[] = [];

        const started = Date.now();
        const res = await msg
          .awaitMessageComponent({
            filter: async (i) => {
              if (losers.includes(i.user.id)) return;
              if (i.customId !== winningId) {
                i.reply({ embeds: [failEmbed], flags: 64 });
                losers.push(i.user.id);
                return false;
              }

              try {
                if ((await isEcoBanned(i.user.id)).banned) {
                  i.reply({ embeds: [bannedEmbed], flags: 64 });
                  return false;
                }
              } catch (err) {
                logger.error(
                  `lootdrop: failed to check for ecoban on user ${i.user.id} in clickSpecific`,
                  {
                    err,
                  },
                );
                return true;
              }

              return true;
            },
            time: 30000,
          })
          .catch((err) =>
            logger.error("lootdrop: awaitInteraction failed in clickSpecific", { err }),
          );

        row.components.forEach((b) => (b.disabled = true));

        if (!res) {
          embed.description += "\n\nnobody clicked the button in time 😢";

          await msg.edit({ embeds: [embed], components: [row] });
          return;
        }

        embed.description += `\n\n**${res.user.username.replaceAll("_", "\\_")}** has won in \`${(
          (Date.now() - started) /
          1000
        ).toFixed(2)}s\`!!`;

        res
          .update({ embeds: [embed], components: [row] })
          .then(() => res.followUp({ embeds: [winEmbed], flags: 64 }));

        return res.user.id;
      } catch (err) {
        logger.error("lootdrop: clickSpecific error", { err });

        embed.description +=
          "\n\nsomething went wrong with this lootdrop, please make a support ticket";

        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }
    },
    {
      context: {
        embed,
        row,
        channelId,
        cluster: cluster.cluster,
        winningId,
        winEmbed,
        failEmbed,
        bannedEmbed: new ErrorEmbed("you're banned don't even try loser"),
      },
    },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

export async function startRandomDrop(client: NypsiClient, channelId: string, rain?: string) {
  const pool = getLootPools().random_drop;
  const prize = await rollLootPool(
    pool,
    async (e) => getItems()[e].unique && (await itemExists(e)),
  );

  const games = [fastClickGame, clickSpecificGame, typeFastGame];

  logger.info(`random drop started in ${channelId} ${rain ? "(rain)" : ""}`);
  const winner = await games[Math.floor(Math.random() * games.length)](
    client,
    channelId,
    prize,
    rain,
  );

  if (winner) {
    if (!(await hasProfile(winner))) await createProfile(winner);
    if (!(await userExists(winner))) await createUser(winner);
    if ((await isEcoBanned(winner).catch(() => ({ banned: false }))).banned) return;

    logger.info(
      `random drop in ${channelId} winner: ${winner} (${await getLastKnownUsername(
        winner,
        false,
      )}) prize: ${JSON.stringify(prize)} ${rain ? "(rain)" : ""}`,
    );

    if (!rain) {
      addProgress(winner, "lootdrops_pro", 1);
      addTaskProgress(winner, "lootdrops");
    }

    await giveLootPoolResult(winner, prize);
  }
}

export async function startLootRain(channel: GuildTextBasedChannel, user: User) {
  let length = 60;
  if (Constants.LOOT_RAIN_ALLOWED_CHANNELS.includes(channel.id)) length = 120;

  logger.info(`starting loot rain in ${channel.id}`);
  if (await redis.exists(`nypsi:lootrain:channel:${channel.id}`)) return;
  await redis.set(`nypsi:lootrain:channel:${channel.id}`, "meow", "EX", length * 2);
  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, channel.id);

  let active = true;

  await channel.send({
    embeds: [
      new CustomEmbed(
        null,
        `**${user.username.replaceAll("_", "\\_")}'s loot rain is starting!!!**`,
      ).setColor(0xffffff),
    ],
  });

  await sleep(5000);

  setTimeout(() => {
    active = false;
    redis.del(`nypsi:lootrain:channel:${channel.id}`);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, channel.id);
    logger.info(`${channel.id} loot rain has ended`);
  }, length * 1000);

  const spawn = async () => {
    if (!active) {
      channel.send({
        embeds: [
          new CustomEmbed(
            null,
            `**${user.username.replaceAll("_", "\\_")}'s loot rain has ended.**`,
          ).setColor(0xffffff),
        ],
      });
      return;
    }

    setTimeout(spawn, Math.floor(Math.random() * 3000) + 4000);

    startRandomDrop(channel.client as NypsiClient, channel.id, user.username);
  };

  spawn();
}
