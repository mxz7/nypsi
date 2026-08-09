import { Routes } from "discord-api-types/v10";
import { GuildTextBasedChannel, User } from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../../utils/Constants";
import { MStoTime } from "../../utils/functions/date";
import { hasGemBeenGiven } from "../../utils/functions/economy/gems";
import { isGem, itemExists } from "../../utils/functions/economy/inventory";
import { startLootDrop } from "../../utils/functions/economy/loot-drops";
import { rollLootPool } from "../../utils/functions/economy/loot_pools";
import { getItems, getLootPools } from "../../utils/functions/economy/utils";
import { removeUserPlaying, setUserPlaying } from "../../utils/functions/playing";
import { percentChance, shuffle } from "../../utils/functions/random";
import sleep from "../../utils/functions/sleep";
import { escapeFormattingCharacters } from "../../utils/functions/string";
import { logger } from "../../utils/logger";
import { getRest } from "../../utils/rest";
import dayjs = require("dayjs");
import ms = require("ms");
import pAll = require("p-all");

const max = 3;
const cooldownSeconds = 900;
const activityWithinSeconds = 20;
const activeUsersRequired = 2;

function doRandomDrop(client: NypsiClient) {
  const delay = Math.floor(Math.random() * ms("10 minutes") + ms("3 minutes"));

  setTimeout(() => {
    randomDrop(client).catch((error) =>
      logger.error("lootdrop: random drop cycle failed", {
        clusterId: client.cluster.id,
        error,
      }),
    );
    doRandomDrop(client);
  }, delay);
  logger.info(`lootdrop: next random drops will occur in ${MStoTime(delay)}`);
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

  for (const activeChannel of query) {
    const existing = channels.find((channel) => channel.channelId === activeChannel.channelId);

    if (existing) {
      existing.users++;
    } else {
      channels.push({ channelId: activeChannel.channelId, users: 1 });
    }
  }

  return channels
    .filter((channel) => channel.users >= activeUsersRequired || percentChance(5))
    .map((channel) => channel.channelId);
}

async function rollRandomDrop() {
  const gemGiven = await hasGemBeenGiven();

  return rollLootPool(
    getLootPools().random_drop,
    async (itemId) =>
      (getItems()[itemId].unique && (await itemExists(itemId))) || (gemGiven && isGem(itemId)),
  );
}

async function randomDrop(client: NypsiClient) {
  const channels = await getChannels();

  if (
    channels.length === 0 ||
    (await redis.get("nypsi:maintenance")) ||
    (await redis.get(`${Constants.redis.nypsi.RESTART}:${client.cluster.id}`)) === "t"
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

      const prize = await rollRandomDrop();

      logger.info(`lootdrop: starting random drop in ${channelId}`, { channelId, prize });
      await startLootDrop(client, channelId, prize);
    });
  }

  await pAll(functions, { concurrency: 2 });
}

export async function startRandomDrop(client: NypsiClient, channelId: string, rain?: string) {
  try {
    const prize = await rollRandomDrop();

    logger.info(`lootdrop: starting random drop in ${channelId}`, { channelId, prize, rain });
    await startLootDrop(client, channelId, prize, rain);
  } catch (error) {
    logger.error("lootdrop: failed to start random drop", { channelId, error, rain });
  }
}

async function sendLootRainMessage(
  client: NypsiClient,
  channelId: string,
  user: User,
  status: "starting" | "ended",
) {
  const description =
    status === "starting"
      ? `**${escapeFormattingCharacters(user.username)}'s loot rain is starting!!!**`
      : `**${escapeFormattingCharacters(user.username)}'s loot rain has ended.**`;

  await getRest(client)
    .post(Routes.channelMessages(channelId), {
      body: {
        embeds: [new CustomEmbed(null, description).setColor(0xffffff)],
      },
    })
    .catch((error) =>
      logger.error(`lootdrop: failed to send loot rain ${status} message`, {
        channelId,
        error,
        userId: user.id,
      }),
    );
}

export async function startLootRain(channel: GuildTextBasedChannel, user: User) {
  let length = 60;
  if (Constants.LOOT_RAIN_ALLOWED_CHANNELS.includes(channel.id)) length = 120;

  logger.info(`lootdrop: starting loot rain in ${channel.id}`, {
    channelId: channel.id,
    userId: user.id,
  });
  if (await redis.exists(`nypsi:lootrain:channel:${channel.id}`)) return;

  await redis.set(`nypsi:lootrain:channel:${channel.id}`, "meow", "EX", length * 2);
  await setUserPlaying(channel.id, "loot rain");

  const client = channel.client as NypsiClient;

  await sendLootRainMessage(client, channel.id, user, "starting");
  await sleep(5000);

  let active = true;

  setTimeout(() => {
    active = false;
    redis.del(`nypsi:lootrain:channel:${channel.id}`);
    removeUserPlaying(channel.id);
    logger.info(`lootdrop: loot rain ended in ${channel.id}`, { channelId: channel.id });
  }, length * 1000);

  const spawn = async () => {
    if (!active) {
      await sendLootRainMessage(client, channel.id, user, "ended");
      return;
    }

    setTimeout(
      () => {
        spawn().catch((error) =>
          logger.error("lootdrop: loot rain spawn failed", {
            channelId: channel.id,
            error,
            userId: user.id,
          }),
        );
      },
      Math.floor(Math.random() * 3000) + 4000,
    );
    await startRandomDrop(client, channel.id, user.username);
  };

  await spawn().catch((error) =>
    logger.error("lootdrop: initial loot rain spawn failed", {
      channelId: channel.id,
      error,
      userId: user.id,
    }),
  );
}
