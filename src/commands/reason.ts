import { CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getCase, setReason } from "../utils/functions/moderation/cases";

const cmd = new Command(
  "reason",
  "set a reason for a case/punishment",
  "moderation",
).setPermissions(["MANAGE_MESSAGES"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length <= 1) {
    const embed = new CustomEmbed(message.member)
      .setHeader("reason help")
      .addField("usage", `${prefix}reason <case ID> <new reason>`)
      .addField("help", "use this command to change the current reason for a punishment case");

    return await message.channel.send({ embeds: [embed] });
  }

  const caseID = args[0];

  args.shift();

  const reason = args.join(" ");

  const case0 = await getCase(message.guild, parseInt(caseID));

  if (!case0) {
    return message.channel.send({
      embeds: [new ErrorEmbed("couldn't find a case with the id `" + caseID + "`")],
    });
  }

  await setReason(message.guild, parseInt(caseID), reason);

  const embed = new CustomEmbed(message.member).setDescription("✅ case updated");

  return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
