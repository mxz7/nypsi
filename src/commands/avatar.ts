import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getMember } from "../utils/functions/member";

const avatar = new Command("avatar", "get a person's avatar", "info");

avatar.setAliases(["av", "pfp", "picture"]);

avatar.slashEnabled = true;

avatar.slashData.addUserOption((option) =>
  option.setName("user").setDescription("view avatar of this user").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });
  }

  const avatar = member.user.displayAvatarURL({ size: 256, extension: "png" });

  let serverAvatar = member.displayAvatarURL({ size: 256, extension: "png" });

  if (avatar == serverAvatar) {
    serverAvatar = undefined;
  }

  const embed = new CustomEmbed(member).setHeader(member.user.username).setImage(avatar);

  let showingServerAvatar = false;

  const buildRow = () =>
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("toggle")
        .setLabel(showingServerAvatar ? "show user avatar" : "show server avatar")
        .setStyle(ButtonStyle.Primary),
    );

  if (!serverAvatar) {
    return send({ embeds: [embed] });
  }

  const msg = await send({ embeds: [embed], components: [buildRow()] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const listen = async () => {
    const collected = await msg
      .awaitMessageComponent({ filter, time: 15000 })
      .catch(async () => {
        await msg.edit({ components: [] });
      });

    if (!collected) return;

    showingServerAvatar = !showingServerAvatar;
    embed.setImage(showingServerAvatar ? serverAvatar : avatar);
    await collected.update({ embeds: [embed], components: [buildRow()] });
    return listen();
  };

  await listen();
}

avatar.setRun(run);

module.exports = avatar;
