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
import { MStoTime } from "../../utils/functions/date";
import { addProgress } from "../../utils/functions/economy/achievements";
import { addInventoryItem } from "../../utils/functions/economy/inventory";
import { createUser, getItems, isEcoBanned, userExists } from "../../utils/functions/economy/utils";
import { getPrefix } from "../../utils/functions/guilds/utils";
import { percentChance, shuffle } from "../../utils/functions/random";
import { getZeroWidth } from "../../utils/functions/string";
import { getLastKnownUsername } from "../../utils/functions/users/tag";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");

const max = 3;
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
  const rand = Math.floor(Math.random() * ms("45 minutes") + ms("15 minutes"));
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
    (await redis.get(Constants.redis.nypsi.RESTART)) == "t"
  )
    return;

  let count = 0;

  for (const channelId of shuffle(channels)) {
    if (await redis.exists(`nypsi:lootdrop:channel:cd:${channelId}`)) continue;

    count++;

    await redis.set(`nypsi:lootdrop:channel:cd:${channelId}`, "69", "EX", 3600);

    const items = Array.from(Object.values(getItems()))
      .filter((i) => i.random_drop_chance && percentChance(i.random_drop_chance))
      .map((i) => `item:${i.id}`);

    if (items.length === 0) continue;

    const prize = items[Math.floor(Math.random() * items.length)];

    const games = [fastClickGame, clickSpecificGame, typeFastGame];

    logger.info(`random drop started in ${channelId}`);
    const winner = await games[Math.floor(Math.random() * games.length)](client, channelId, prize);

    if (winner) {
      if (await isEcoBanned(winner).catch(() => false)) continue;

      logger.info(
        `random drop in ${channelId} winner: ${winner} (${await getLastKnownUsername(
          winner,
        )}) prize: ${prize}`,
      );

      addProgress(winner, "lootdrops_pro", 1);

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
  const cluster = await findCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(
      `first to click the button wins ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
          : ""
      }`,
    );
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(
      `you've won ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
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

      const channel = await client.channels.fetch(channelId).catch(() => {});

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

      await Promise.all([
        res.reply({ embeds: [winEmbed], ephemeral: true }),
        msg.edit({ embeds: [embed], components: [row] }),
      ]);

      return res.user.id;
    },
    { context: { embed, row, channelId, cluster: cluster.cluster, buttonId, winEmbed } },
  );

  const winnerId = winner.filter((i) => Boolean(i))[0];

  if (!(await userExists(winnerId))) await createUser(winnerId);

  return winnerId;
}

async function typeFastGame(client: NypsiClient, channelId: string, prize: string) {
  const cluster = await findCluster(client, channelId);

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
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
          : ""
      }`,
    );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, channelId, cluster, chosenWord }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = await client.channels.fetch(channelId).catch(() => {});

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
  const cluster = await findCluster(client, channelId);

  if (typeof cluster.cluster !== "number") return;

  const colours = ["red", "blue", "green", "gray"];

  const chosenColour = colours[Math.floor(Math.random() * colours.length)];

  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", client.user.avatarURL())
    .setDescription(
      `first to click the **${chosenColour}** button wins ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
          : ""
      }`,
    );
  const winEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader(`you've won a loot drop!`)
    .setDescription(
      `you've won ${
        prize.startsWith("item:")
          ? `${getItems()[prize.substring(5)].article} ${getItems()[prize.substring(5)].emoji} **${getItems()[prize.substring(5)].name}**`
          : ""
      }`,
    );
  const failEmbed = new CustomEmbed()
    .setColor(Constants.EMBED_FAIL_COLOR)
    .setHeader(`uh oh ):`)
    .setDescription(
      `you clicked the wrong button!! you had to click the **${chosenColour}** button`,
    );

  const greenButtonId = randomUUID();
  const redButtonId = randomUUID();
  const blueButtonId = randomUUID();
  const greyButtonId = randomUUID();

  let winningId = "";

  switch (chosenColour) {
    case "red":
      winningId = redButtonId;
      break;
    case "blue":
      winningId = blueButtonId;
      break;
    case "green":
      winningId = greenButtonId;
      break;
    case "gray":
      winningId = greyButtonId;
      break;
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    shuffle([
      new ButtonBuilder()
        .setCustomId(greenButtonId)
        .setLabel("\u200b")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(redButtonId).setLabel("\u200b").setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(blueButtonId)
        .setLabel("\u200b")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(greyButtonId)
        .setLabel("\u200b")
        .setStyle(ButtonStyle.Secondary),
    ]),
  );

  const winner = await client.cluster.broadcastEval(
    async (c, { embed, row, channelId, cluster, winningId, winEmbed, failEmbed }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id != cluster) return;

      const channel = await client.channels.fetch(channelId).catch(() => {});

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

      await Promise.all([
        res.reply({ embeds: [winEmbed], ephemeral: true }),
        msg.edit({ embeds: [embed], components: [row] }),
      ]);

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

async function findCluster(client: NypsiClient, channelId: string) {
  const clusterHas = await client.cluster.broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;

      const channel = await client.channels.fetch(channelId).catch(() => {});

      if (channel && !channel.isDMBased()) {
        return { cluster: client.cluster.id, guildId: channel.guildId };
      } else {
        return "not-found";
      }
    },
    {
      context: { channelId },
    },
  );

  for (const i of clusterHas) {
    if (i != "not-found") {
      return i;
    }
  }

  return null;
}
