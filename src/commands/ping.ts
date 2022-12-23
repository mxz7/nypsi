import { CommandInteraction, Message } from "discord.js";
import prisma from "../init/database";
import redis from "../init/redis";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command(
  "ping",
  "measured by timing how long it takes for a message to be sent - rate limiting can affect this",
  Categories.INFO
).setAliases(["latency"]);

let pingingDb = false;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  /**
   * not perfect latency testing i know but it works!!
   */
  const redisLatency: number[] = [];

  let now = Date.now();
  await redis.set("ping:test", "pong");
  let after = Date.now();

  redisLatency[0] = after - now;

  now = Date.now();
  await redis.del("ping:test");
  after = Date.now();

  redisLatency[1] = after - now;

  const dbLatency: number[] = [];

  if (!pingingDb) {
    pingingDb = true;

    now = Date.now();
    await prisma.user.create({
      data: {
        id: "test_user",
        lastKnownTag: "",
        lastCommand: new Date(),
      },
    });
    after = Date.now();

    dbLatency[0] = after - now;

    now = Date.now();
    await prisma.user.update({
      where: {
        id: "test_user",
      },
      data: {
        karma: 69,
      },
    });
    after = Date.now();

    dbLatency[1] = after - now;

    now = Date.now();
    await prisma.user.delete({
      where: {
        id: "test_user",
      },
    });
    after = Date.now();

    pingingDb = false;

    dbLatency[2] = after - now;
  }

  now = Date.now();
  const msg = await message.channel.send({ content: "pong" });
  after = Date.now();

  const msgLatency = after - now;

  const discordLatency = Math.round(message.client.ws.ping);

  const embed = new CustomEmbed(message.member);

  let desc =
    `websocket \`${discordLatency}ms\`\n` +
    `bot message \`${msgLatency}ms\`\n` +
    `redis \`${redisLatency.join("ms` | `")}ms\``;

  if (dbLatency) {
    desc += `\ndatabase \`${dbLatency.join("ms` | `")}ms\``;
  }

  embed.setDescription(desc);

  return await msg.edit({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
