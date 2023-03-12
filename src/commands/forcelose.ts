import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";

const cmd = new Command("forcelose", "make an account lose 100% of the time", "none");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!Constants.ADMIN_IDS.includes(message.author.id)) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  for (const user of args) {
    if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, user)) {
      await redis.srem(Constants.redis.nypsi.FORCE_LOSE, user);
    } else {
      await redis.sadd(Constants.redis.nypsi.FORCE_LOSE, user);
    }
  }

  if (!(message instanceof Message)) return;

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
