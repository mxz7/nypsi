import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import { arrayToPage } from "../utils/functions/page";
import { isPremium } from "../utils/functions/premium/premium";
import { decrypt } from "../utils/functions/string";
import { getLastCommand } from "../utils/functions/users/commands";
import { deleteUserMentions, fetchUserMentions } from "../utils/functions/users/mentions";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("pings", "view who mentioned you recently", Categories.UTILITY).setAliases([
  "mentions",
  "whothefuckpingedme",
]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 20);

  let qualified = false;

  if (
    message.guild.memberCount < 150000 &&
    ((await userExists(message.guild.ownerId)) ||
      (await isPremium(message.guild.ownerId)) ||
      (await getKarma(message.guild.ownerId)) >= 50 ||
      (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("1 days"))
  ) {
    qualified = true;
  } else if (message.author.id == message.guild.ownerId) {
    await createUser(message.member);
    qualified = true;
  }

  const prefix = await getPrefix(message.guild);

  if (!qualified) {
    const embed = new ErrorEmbed(
      `this server does not qualify to track mentions (${prefix}pings)\nhttps://docs.nypsi.xyz/#my-server-does-not-qualify-for-the-pings-command\njoin the support server for help (${prefix}support)`
    );

    return send({ embeds: [embed] });
  }

  let limit = 5;

  if (await isPremium(message.author.id)) {
    limit = 150;
  }

  const mentions = await fetchUserMentions(message.guild, message.member, limit);

  if (!mentions || mentions.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "no recent mentions")] });
  }

  const pages = arrayToPage(
    mentions.map(
      (i) => `<t:${Math.floor(i.date.getTime() / 1000)}:R>|6|9|**${i.userTag}**: ${decrypt(i.content)}\n[jump](${i.url})`
    ),
    3
  );

  const embed = new CustomEmbed(message.member).setHeader("recent mentions", message.author.avatarURL());

  for (const i of pages.get(1)) {
    const fieldName = i.split("|6|9|")[0];
    const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
    embed.addField(fieldName, fieldValue);
  }

  if (pages.size >= 2) {
    embed.setFooter({ text: `page 1/${pages.size}` });
  }

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
  );

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  if (pages.size >= 2) {
    let currentPage = 1;
    const lastPage = pages.size;

    const edit = async (data: MessageEditOptions) => {
      if (!(message instanceof Message)) {
        await message.editReply(data);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected.customId;
        })
        .catch(async () => {
          await edit({ components: [] }).catch(() => {});
        });

      if (!reaction) return;

      const newEmbed = new CustomEmbed(message.member).setHeader("recent mentions", message.author.avatarURL());

      if (reaction == "⬅") {
        if (currentPage <= 1) {
          return pageManager();
        } else {
          currentPage--;

          for (const i of pages.get(currentPage)) {
            const fieldName = i.split("|6|9|")[0];
            const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
            newEmbed.addField(fieldName, fieldValue);
          }

          newEmbed.setFooter({ text: "page " + currentPage + "/" + lastPage });
          if (currentPage == 1) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
            );
          }
          await edit({ embeds: [newEmbed], components: [row] });
          return pageManager();
        }
      } else if (reaction == "➡") {
        if (currentPage >= lastPage) {
          return pageManager();
        } else {
          currentPage++;

          for (const i of pages.get(currentPage)) {
            const fieldName = i.split("|6|9|")[0];
            const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
            newEmbed.addField(fieldName, fieldValue);
          }
          newEmbed.setFooter({ text: "page " + currentPage + "/" + lastPage });
          if (currentPage == lastPage) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger)
            );
          }
          await edit({ embeds: [newEmbed], components: [row] });
          return pageManager();
        }
      } else if (reaction == "❌") {
        deleteUserMentions(message.guild, message.member);

        newEmbed.setDescription("✅ mentions cleared");

        edit({ embeds: [newEmbed], components: [] });
        return;
      }
    };

    return pageManager();
  }
}

cmd.setRun(run);

module.exports = cmd;
