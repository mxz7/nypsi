import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
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
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const avatar = member.user.displayAvatarURL({ size: 256, extension: "png" });

  let serverAvatar = member.displayAvatarURL({ size: 256, extension: "png" });

  if (avatar == serverAvatar) {
    serverAvatar = undefined;
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("x")
      .setLabel("show server avatar")
      .setStyle(ButtonStyle.Primary),
  );

  const embed = new CustomEmbed(member).setHeader(member.user.username).setImage(avatar);

  let msg: Message;

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (serverAvatar) {
    msg = await send({ embeds: [embed], components: [row] });
  } else {
    return send({ embeds: [embed] });
  }

  const edit = async (data: MessageEditOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await msg.edit(data);
    }
  };

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      await edit({ components: [] });
    });

  if (reaction == "x") {
    embed.setImage(serverAvatar);

    await edit({ embeds: [embed], components: [] });
  }
}

avatar.setRun(run);

module.exports = avatar;
