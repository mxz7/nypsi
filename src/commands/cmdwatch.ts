import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";
import { getAdminLevel } from "../utils/functions/users/admin";
import { logger } from "../utils/logger";

const cmd = new Command("cmdwatch", "watch commands", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 2) return;

  if (args.length < 2) {
    return message.channel.send({ content: "dumbass - $cmdwatch <userid> <cmd>" });
  }

  if (!(message instanceof Message)) return; // never gonna give you up. never gonna let you down. never gonna run around. and. DESERT YOU

  if (await redis.exists(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`)) {
    await redis.del(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`);
    await message.react("➖");
  } else {
    await redis.set(`${Constants.redis.nypsi.COMMAND_WATCH}:${args[0]}:${args[1]}`, "t");
    await message.react("➕");
  }

  logger.info(
    `admin: ${message.author.id} (${message.author.username}) toggled command watch - ${args.join(
      " ",
    )}`,
  );
}

cmd.setRun(run);

module.exports = cmd;
