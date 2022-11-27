import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";

const cmd = new Command("maintenance", "maintenance", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

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
