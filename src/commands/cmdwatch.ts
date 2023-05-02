import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { getAdminLevel } from "../utils/functions/users/admin";
import { logger } from "../utils/logger";

const cmd = new Command("cmdwatch", "watch commands", "none");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if ((await getAdminLevel(message.author.id)) < 2) return;

  if (args.length < 2) {
    return message.channel.send({ content: "dumbass - $cmdwatch <userid> <cmd>" });
  }

  if (await redis.exists(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`)) {
    await redis.del(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`);
  } else {
    await redis.set(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`, "t");
  }

  logger.info(`admin: ${message.author.id} (${message.author.tag}) toggled command watch - ${args.join(" ")}`);

  if (!(message instanceof Message)) return; // never gonna give you up. never gonna let you down. never gonna run around. and. DESERT YOU

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
