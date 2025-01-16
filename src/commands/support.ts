import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import Constants from "../utils/Constants";

const cmd = new Command("support", "join the nypsi support server", "info").setAliases(["discord"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  return message.channel.send({ content: Constants.NYPSI_SERVER_INVITE_LINK });
}

cmd.setRun(run);

module.exports = cmd;
