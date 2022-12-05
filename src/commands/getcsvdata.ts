import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import graphToCsv from "../utils/functions/workers/graphtocsv";

const cmd = new Command("getcsvdata", "get csv data", Categories.NONE).setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!Constants.ADMIN_IDS.includes(message.author.id)) return;

  const msg = await message.channel.send({ content: "processing..." });

  await graphToCsv();

  msg.edit({ content: "done (/temp)" });
}

cmd.setRun(run);

module.exports = cmd;
