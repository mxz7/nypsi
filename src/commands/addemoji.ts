import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "addemoji",
  "add an emoji from a different server to your server",
  "utility",
)
  .setPermissions(["MANAGE_EMOJIS"])
  .setAliases(["stealemoji"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("emoji")
    .setDescription("emoji from another server or url to an image")
    .setRequired(true),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    return send({
      embeds: [new ErrorEmbed("i need the `manage emojis` permission for this command to work")],
    });
  }

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({ embeds: [new ErrorEmbed("you need the `manage emojis` permission")] });
    }
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0 && message instanceof Message && !message.attachments.first()) {
    return send({
      embeds: [new ErrorEmbed(`${prefix}addemoji <emoji>`)],
    });
  }

  let mode = "arg";
  let url;
  let name;

  if (
    args.length == 0 ||
    (message instanceof Message && message.attachments && message.attachments.first())
  ) {
    mode = "attachment";
  } else if (args[0]) {
    if (args[0].startsWith("http")) {
      mode = "url";
    } else {
      mode = "emoji";
    }
  }

  if (mode == "attachment" && message instanceof Message) {
    url = message.attachments.first().proxyURL;
    if (args.length != 0) {
      name = args[0];
    } else {
      name = message.attachments.first().name.split(".")[0];
    }
  } else if (mode == "emoji") {
    let emoji: string | string[] = args[0];

    emoji = emoji.split(":");

    if (!emoji[2]) {
      return send({ embeds: [new ErrorEmbed("invalid emoji - please use a custom emoji")] });
    }

    const emojiID = emoji[2].slice(0, emoji[2].length - 1);

    if (args[1]) {
      name = args[1];
    } else {
      name = emoji[1];
    }

    url = `https://cdn.discordapp.com/emojis/${emojiID}`;

    if (emoji[0].includes("a")) {
      url = url + ".gif";
    } else {
      url = url + ".png";
    }
  } else if (mode == "url") {
    url = args[0];
    if (args[1]) {
      name = args[1];
    } else {
      const a = url.split("/");
      name = a[a.length - 1];
      name = name.split(".")[0];
    }
  }

  await addCooldown(cmd.name, message.member, 5);

  let fail = false;

  await message.guild.emojis
    .create({
      attachment: url,
      name: name,
    })
    .catch((e) => {
      fail = true;

      return send({ embeds: [new ErrorEmbed(`\`\`\`${e.message}\`\`\``)] });
    });

  if (fail) return;

  return send({
    embeds: [new CustomEmbed(message.member, `✅ emoji added as \`:${name}:\``)],
  });
}

cmd.setRun(run);

module.exports = cmd;
