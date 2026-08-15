import { MessageFlags } from "discord.js";
import { Command } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { buildClickMessage } from "../utils/functions/clicks";

const cmd = new Command("click", "play the click game", "money");

cmd.slashEnabled = true;

cmd.setRun(async (message, send) => {
  if (!message.guildId) {
    return send({
      embeds: [new ErrorEmbed("click can only be played in a server")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await send(await buildClickMessage(message.author, message.guild));
});

module.exports = cmd;
