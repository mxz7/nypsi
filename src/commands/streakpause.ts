import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { getAdminLevel } from "../utils/functions/users/admin";
import ms = require("ms");

const cmd = new Command("streakpause", "pause streaks", "none");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 5) return;

  if (args.length === 0) {
    await redis.set("nypsi:streakpause", 69, "EX", ms("1 day") / 1000);
    return message.channel.send({ content: "streaks won't be lost in the next 24 hours" });
  } else if (args[0].toLowerCase() === "end") {
    await redis.del("nypsi:streakpause");
    return (message as Message).react("✅");
  }
}

cmd.setRun(run);

module.exports = cmd;
