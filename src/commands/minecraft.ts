import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("minecraft", "view minecraft name history", "minecraft").setAliases(["mc"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  return send({
    embeds: [
      new ErrorEmbed(
        "this command is disabled due to mojang api unfortunately no longer providing username history, and there being no suitable alternative\n\n" +
          "if you know of an alternative, please DM me to make a support request, or dm @m.axz",
      ),
    ],
  });
}

cmd.setRun(run);
module.exports = cmd;
