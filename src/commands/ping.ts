import { CommandInteraction } from "discord.js";
import { loadavg } from "os";
import prisma from "../init/database";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command(
  "ping",
  "measured by timing how long it takes for a message to be sent - rate limiting can affect this",
  "info",
).setAliases(["latency"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  /**
   * not perfect latency testing i know but it works!!
   */
  const redisLatency: number[] = [];

  let now = performance.now();
  await redis.ping();
  let after = performance.now();

  redisLatency.push(after - now);

  now = performance.now();
  await redis.set("ping:test", "pong");
  after = performance.now();

  redisLatency.push(after - now);

  now = performance.now();
  await redis.get("ping:test");
  after = performance.now();

  redisLatency.push(after - now);

  now = performance.now();
  await redis.set("ping:test", "boobies");
  after = performance.now();

  redisLatency.push(after - now);

  now = performance.now();
  await redis.del("ping:test");
  after = performance.now();

  redisLatency.push(after - now);

  const dbLatency: number[] = [];

  now = performance.now();
  await prisma.$queryRaw`select 1`;
  after = performance.now();

  dbLatency.push(after - now);

  const dbId = "latency_test_user_" + Math.floor(Math.random() * 100);

  now = performance.now();
  await prisma.user.create({
    data: {
      id: dbId,
      lastKnownUsername: "",
      lastCommand: new Date(),
    },
  });
  after = performance.now();

  dbLatency.push(after - now);

  now = performance.now();
  await prisma.user.findUnique({
    where: {
      id: dbId,
    },
    select: {
      karma: true,
    },
  });
  after = performance.now();

  dbLatency.push(after - now);

  now = performance.now();
  await prisma.user.update({
    where: {
      id: dbId,
    },
    data: {
      karma: 69,
    },
  });
  after = performance.now();

  dbLatency.push(after - now);

  now = performance.now();
  await prisma.user.delete({
    where: {
      id: dbId,
    },
  });
  after = performance.now();

  dbLatency.push(after - now);

  now = performance.now();
  const msg = await message.channel.send({ content: "pong" });
  after = performance.now();

  const msgLatency = (after - now).toFixed(1);

  const discordLatency = message.client.ws.ping;

  const embed = new CustomEmbed(message.member);

  let desc =
    `websocket \`${discordLatency}ms\`\n` +
    `bot message \`${msgLatency}ms\`\n` +
    `redis \`${redisLatency.map((i) => i.toFixed(1)).join("ms` | `")}ms\``;

  if (dbLatency) {
    desc += `\ndatabase \`${dbLatency.map((i) => i.toFixed(1)).join("ms` | `")}ms\``;
  }

  embed.setDescription(
    `${desc}\nload avg ${loadavg()
      .map((i) => `\`${i.toFixed(2)}\``)
      .join(" ")}`,
  );

  return await msg.edit({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
