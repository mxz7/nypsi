import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";
import graphToCsv from "../utils/functions/workers/graphtocsv";

const cmd = new Command("getcsvdata", "get csv data", "none").setPermissions(["bot owner"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id !== Constants.TEKOH_ID) return;

  const msg = await message.channel.send({ content: "processing..." });

  await graphToCsv();

  msg.edit({ content: "done (/temp)" });
}

cmd.setRun(run);

module.exports = cmd;
