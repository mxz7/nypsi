import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import PageManager from "../utils/functions/page";
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
      (await getKarma(message.guild.ownerId)) >= 10 ||
      (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("30 days"))
  ) {
    qualified = true;
  } else if (message.author.id == message.guild.ownerId) {
    await createUser(message.member);
    qualified = true;
  }

  const prefix = await getPrefix(message.guild);

  if (!qualified) {
    const embed = new ErrorEmbed(
      `this server does not qualify to track mentions (/pings)\n[more information](https://docs.nypsi.xyz/#my-server-does-not-qualify-for-the-pings-command)\njoin the support server for help (${prefix}support)`
    );

    return send({ embeds: [embed] });
  }

  let limit = 3;

  if (await isPremium(message.author.id)) {
    limit = 207;
  }

  const mentions = await fetchUserMentions(message.guild, message.member, limit);

  if (!mentions || mentions.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "no recent mentions")] });
  }

  const pages = PageManager.createPages(
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

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
    const manager = new PageManager({
      embed: embed,
      message: msg,
      row: row,
      userId: message.author.id,
      pages: pages,
      updateEmbed(page: string[], embed) {
        embed.data.fields.length = 0;

        for (const line of page) {
          const fieldName = line.split("|6|9|")[0];
          const fieldValue = line.split("|6|9|").splice(-1, 1).join("");
          embed.addField(fieldName, fieldValue);
        }

        return embed;
      },
      onPageUpdate(manager) {
        manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
        return manager.embed;
      },
      handleResponses: new Map().set("❌", async (manager: PageManager<string>, interaction: ButtonInteraction) => {
        await interaction.deferUpdate();
        await deleteUserMentions(manager.message.guild, manager.userId);

        embed.data.fields.length = 0;

        embed.setDescription("✅ mentions cleared");
        embed.disableFooter();

        await manager.message.edit({ embeds: [embed], components: [] });
        return;
      }),
    });

    return manager.listen();
  }
}

cmd.setRun(run);

module.exports = cmd;
