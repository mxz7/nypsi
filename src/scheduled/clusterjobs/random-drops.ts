import ms = require("ms");
import { randomUUID } from "crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { findChannelCluster } from "../../utils/functions/clusters";
import { MStoTime } from "../../utils/functions/date";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { addTaskProgress } from "../../utils/functions/economy/tasks";
import { createUser, getItems, isEcoBanned, userExists } from "../../utils/functions/economy/utils";
import { getPrefix } from "../../utils/functions/guilds/utils";
import { percentChance, shuffle } from "../../utils/functions/random";
import { getZeroWidth } from "../../utils/functions/string";
import { getLastKnownUsername } from "../../utils/functions/users/tag";
import { createProfile, hasProfile } from "../../utils/functions/users/utils";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");

const max = 3;
const cooldownSeconds = 1800;
const activityWithinSeconds = 30;
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
  "{prefix}wholesome",
];

function doRandomDrop(client: NypsiClient) {
  const rand = Math.floor(Math.random() * ms("30 minutes") + ms("15 minutes"));
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

  for (const channelId of shuffle(channels)) {
    if (await redis.exists(`nypsi:lootdrop:channel:cd:${channelId}`)) continue;

    count++;

    await redis.set(`nypsi:lootdrop:channel:cd:${channelId}`, "69", "EX", cooldownSeconds);

    const items = Array.from(Object.values(getItems()))
      .filter((i) => i.random_drop_chance && percentChance(i.random_drop_chance))
      .map((i) => `item:${i.id}`);

    if (items.length === 0) continue;

    const prize = items[Math.floor(Math.random() * items.length)];

    const games = [fastClickGame, clickSpecificGame, typeFastGame];

    logger.info(`random drop started in ${channelId}`);
    const winner = await games[Math.floor(Math.random() * games.length)](client, channelId, prize);

    if (winner) {
      if (!(await hasProfile(winner))) await createProfile(winner);
      if (!(await userExists(winner))) await createUser(winner);
      if (await isEcoBanned(winner).catch(() => false)) continue;

      logger.info(
        `random drop in ${channelId} winner: ${winner} (${await getLastKnownUsername(
          winner,
        )}) prize: ${prize}`,
      );

      addProgress(winner, "lootdrops_pro", 1);
      addTaskProgress(winner, "lootdrops");

      if (prize.startsWith("item:")) {
        let amount = 1;

        if (getItems()[prize.substring(5)].role === "tool") amount = 15;

        await addInventoryItem(winner, prize.substring(5), amount);
      }
    }

    if (count >= max) break;
  }
}

async function fastClickGame(client: NypsiClient, channelId: string, prize: string) {
  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(
      `first to click the button wins ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${
              getItems()[prize.substring(5)].name
            }**`
          : ""
      }`,
    );
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(
      `you've won ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${
              getItems()[prize.substring(5)].name
            }**`
          : ""
      }`,
    );

  const buttonId = randomUUID();

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buttonId).setLabel("click me").setStyle(ButtonStyle.Success),
  );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, row, channelId, cluster, buttonId, winEmbed }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isTextBased()) return;

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const started = Date.now();
      const res = await msg
        .awaitMessageComponent({
          filter: (i) => i.customId === buttonId,
          time: 30000,
        })
        .catch(() => {});

      row.components.forEach((b) => (b.disabled = true));

      if (!res) {
        embed.description += "\n\nnobody clicked the button in time 😢";

        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }

      embed.description += `\n\n**${res.user.username}** has won in \`${(
        (Date.now() - started) /
        1000
      ).toFixed(2)}s\`!!`;

      res
        .update({ embeds: [embed], components: [row] })
        .then(() => res.followUp({ embeds: [winEmbed], ephemeral: true }));

      return res.user.id;
    },
    { context: { embed, row, channelId, cluster: cluster.cluster, buttonId, winEmbed } },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function typeFastGame(client: NypsiClient, channelId: string, prize: string) {
  const cluster = await findChannelCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const chosenWord = words[Math.floor(Math.random() * words.length)].replace(
    `{prefix}`,
    await getPrefix(cluster.guildId),
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
    .setDescription(
      `first to type \`${displayWord}\` wins ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${
              getItems()[prize.substring(5)].name
            }**`
          : ""
      }`,
    );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, channelId, cluster, chosenWord }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isTextBased()) return;

      const msg = await channel.send({ embeds: [embed] });

      const started = Date.now();
      const res = await channel
        .awaitMessages({
          filter: (m) => m.content.toLowerCase() === chosenWord.toLowerCase(),
          time: 30000,
          max: 1,
        })
        .then((m) => m.first())
        .catch(() => {});

      if (!res) {
        embed.description += "\n\nnobody won 😢";

        await msg.edit({ embeds: [embed] });
        return;
      }

      embed.description += `\n\n**${res.author.username}** has won in \`${(
        (Date.now() - started) /
        1000
      ).toFixed(2)}s\`!!`;

      await msg.edit({ embeds: [embed] });

      return res.author.id;
    },
    { context: { embed, channelId, cluster: cluster.cluster, chosenWord } },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function clickSpecificGame(client: NypsiClient, channelId: string, prize: string) {
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
      } wins ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${
              getItems()[prize.substring(5)].name
            }**`
          : ""
      }`,
    );
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(
      `you've won ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${
              getItems()[prize.substring(5)].name
            }**`
          : ""
      }`,
    );
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
    async (c, { embed, row, channelId, cluster, winningId, winEmbed, failEmbed }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = client.channels.cache.get(channelId);

      if (!channel) return;

      if (!channel.isTextBased()) return;

      const msg = await channel.send({ embeds: [embed], components: [row] });

      const losers: string[] = [];

      const started = Date.now();
      const res = await msg
        .awaitMessageComponent({
          filter: (i) => {
            if (losers.includes(i.user.id)) return;
            if (i.customId !== winningId) {
              i.reply({ embeds: [failEmbed], ephemeral: true });
              losers.push(i.user.id);
              return false;
            }

            return true;
          },
          time: 30000,
        })
        .catch(() => {});

      row.components.forEach((b) => (b.disabled = true));

      if (!res) {
        embed.description += "\n\nnobody clicked the button in time 😢";

        await msg.edit({ embeds: [embed], components: [row] });
        return;
      }

      embed.description += `\n\n**${res.user.username}** has won in \`${(
        (Date.now() - started) /
        1000
      ).toFixed(2)}s\`!!`;

      res
        .update({ embeds: [embed], components: [row] })
        .then(() => res.followUp({ embeds: [winEmbed], ephemeral: true }));

      return res.user.id;
    },
    {
      context: { embed, row, channelId, cluster: cluster.cluster, winningId, winEmbed, failEmbed },
    },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

export async function startRandomDrop(client: NypsiClient, channelId: string) {
  const items = Array.from(Object.values(getItems()))
    .filter((i) => i.random_drop_chance && percentChance(i.random_drop_chance))
    .map((i) => `item:${i.id}`);

  if (items.length === 0) return;

  const prize = items[Math.floor(Math.random() * items.length)];

  const games = [fastClickGame, clickSpecificGame, typeFastGame];

  logger.info(`random drop started in ${channelId}`);
  const winner = await games[Math.floor(Math.random() * games.length)](client, channelId, prize);

  if (winner) {
    if (!(await hasProfile(winner))) await createProfile(winner);
    if (!(await userExists(winner))) await createUser(winner);
    if (await isEcoBanned(winner).catch(() => false)) return;

    logger.info(
      `random drop in ${channelId} winner: ${winner} (${await getLastKnownUsername(
        winner,
      )}) prize: ${prize}`,
    );

    addProgress(winner, "lootdrops_pro", 1);
    addTaskProgress(winner, "lootdrops");

    if (prize.startsWith("item:")) {
      let amount = 1;

      if (getItems()[prize.substring(5)].role === "tool") amount = 15;

      await addInventoryItem(winner, prize.substring(5), amount);
    }
  }
}
