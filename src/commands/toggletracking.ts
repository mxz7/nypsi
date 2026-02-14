import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getPrefix } from "../utils/functions/guilds/utils";
import { disableTracking, enableTracking, isTracking } from "../utils/functions/users/history";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "toggletracking",
  "toggle tracking your username and avatar changes",
  "info",
);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 30);

  if (await isTracking(message.member)) {
    await disableTracking(message.member);
    return message.channel.send({
      embeds: [
        new CustomEmbed(
          message.member,
          "✅ username and avatar tracking has been disabled",
        ).setFooter({
          text: `use ${(await getPrefix(message.guild))[0]}(un/avh) clear to clear your history`,
        }),
      ],
    });
  } else {
    await enableTracking(message.member);
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ username and avatar tracking has been enabled")],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
