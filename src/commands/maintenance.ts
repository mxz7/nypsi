import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("maintenance", "maintenance", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 69) return;

  if ((await redis.get("nypsi:maintenance")) == "t") {
    await redis.del("nypsi:maintenance");
  } else {
    await redis.set("nypsi:maintenance", "t");
  }

  if (!(message instanceof Message)) return;

  return message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;
