import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("forcelose", "make an account lose 100% of the time", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.member)) < 3) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  if (!(message instanceof Message)) return;

  for (const user of args) {
    if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, user)) {
      await redis.srem(Constants.redis.nypsi.FORCE_LOSE, user);
      await message.react("➖");
    } else {
      await redis.sadd(Constants.redis.nypsi.FORCE_LOSE, user);
      await message.react("➕");
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
