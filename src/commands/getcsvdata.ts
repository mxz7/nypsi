import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import graphToCsv from "../utils/functions/workers/graphtocsv";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("getcsvdata", "get csv data", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(message.author.id)) < 1) return;

  const msg = await message.channel.send({ content: "processing..." });

  await graphToCsv();

  msg.edit({ content: "done (/temp)" });
}

cmd.setRun(run);

module.exports = cmd;
