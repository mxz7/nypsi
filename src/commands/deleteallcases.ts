import {
  CommandInteraction,
  Message,
  MessageReaction,
  PermissionFlagsBits,
  User,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";

const cmd = new Command("deleteallcases", "delete all cases in a server", "admin")
  .setAliases(["dac"])
  .setPermissions(["server owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  if (
    message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
    message.guild.ownerId != message.author.id
  ) {
    const embed = new ErrorEmbed("to delete all cases you must be the server owner");

    return message.channel.send({ embeds: [embed] });
  }

  const embed = new CustomEmbed(
    message.member,
    "react with ✅ to delete all punishment/moderation cases",
  )
    .setHeader("confirmation")
    .setFooter({ text: "this cannot be reversed" });

  const msg = await message.channel.send({ embeds: [embed] });

  await msg.react("✅");

  const filter = (reaction: MessageReaction, user: User) => {
    return ["✅"].includes(reaction.emoji.name) && user.id == message.author.id;
  };

  const reaction = await msg
    .awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] })
    .then((collected) => {
      return collected.first().emoji.name;
    })
    .catch(async () => {
      await msg.reactions.removeAll();
    });

  if (reaction == "✅") {
    await prisma.moderationCase.deleteMany({
      where: {
        guildId: message.guildId,
      },
    });

    const newEmbed = new CustomEmbed(
      message.member,
      "✅ all cases have been deleted",
    ).setDescription("✅ all cases have been deleted");

    await msg.edit({ embeds: [newEmbed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
