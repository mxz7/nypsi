import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getGuildName } from "../utils/functions/guilds/utils";
import { getKarma } from "../utils/functions/karma/karma";
import PageManager from "../utils/functions/page";
import { isPremium } from "../utils/functions/premium/premium";
import { decrypt } from "../utils/functions/string";
import { getLastCommand } from "../utils/functions/users/commands";
import { deleteUserMentions, fetchUserMentions } from "../utils/functions/users/mentions";
import { getPreferences, updatePreferences } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("pings", "view who mentioned you recently", "utility").setAliases([
  "mentions",
  "whothefuckpingedme",
]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
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

  if (!qualified) {
    const embed = new ErrorEmbed(`this server does not qualify to track mentions (/pings)`);

    return send({ embeds: [embed] });
  }

  const showMentions = async (msg?: Message) => {
    let limit = 9;

    if (await isPremium(message.member)) {
      limit = 207;
    }

    const preferences = await getPreferences(message.member);

    const mentions = await fetchUserMentions(
      message.member,
      preferences.mentionsGlobal ? true : message.guild.id,
      limit,
    );

    if (!mentions || mentions.length == 0) {
      return send({ embeds: [new CustomEmbed(message.member, "no recent mentions")] });
    }

    const values: string[] = [];

    for (const mention of mentions) {
      let title = `<t:${Math.floor(mention.date.getTime() / 1000)}:R>`;

      if (preferences.mentionsGlobal) {
        const name = await getGuildName(mention.guildId);
        title += ` (${name ?? mention.guildId})`;
      }

      title += "|6|9|";

      title += `**${mention.userTag}**: ${decrypt(mention.content)}\n` + `[jump](${mention.url})`;

      values.push(title);
    }

    const pages = PageManager.createPages(values, 3);

    const embed = new CustomEmbed(message.member).setHeader(
      "recent mentions",
      message.author.avatarURL(),
    );

    for (const i of pages.get(1)) {
      const fieldName = i.split("|6|9|")[0];
      const fieldValue = i.split("|6|9|").splice(-1, 1).join("");
      embed.addField(fieldName, fieldValue);
    }

    if (pages.size >= 2) {
      embed.setFooter({ text: `page 1/${pages.size}` });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("❌").setLabel("clear").setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("toggle-global")
        .setLabel(preferences.mentionsGlobal ? "all servers" : message.guild.name.substring(0, 80))
        .setStyle(ButtonStyle.Secondary),
    );

    if (pages.size === 1) {
      row.components.splice(0, 2);
    }

    if (msg) {
      await msg.edit({ embeds: [embed], components: [row, row2] });
    } else {
      msg = await send({ embeds: [embed], components: [row, row2] });
    }

    const manager = new PageManager({
      embed: embed,
      message: msg,
      row: [row, row2],
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
      handleResponses: new Map()
        .set("❌", async (manager: PageManager<string>, interaction: ButtonInteraction) => {
          await interaction.deferUpdate();
          await deleteUserMentions(
            manager.userId,
            preferences.mentionsGlobal ? undefined : message.guild.id,
          );

          embed.data.fields.length = 0;

          embed.setDescription("✅ mentions cleared");
          embed.disableFooter();

          await manager.message.edit({ embeds: [embed], components: [] });
          return;
        })
        .set(
          "toggle-global",
          async (manager: PageManager<string>, interaction: ButtonInteraction) => {
            await interaction.deferUpdate();
            preferences.mentionsGlobal = !preferences.mentionsGlobal;
            await updatePreferences(message.member, preferences);

            return showMentions(manager.message);
          },
        ),
    });

    return manager.listen();
  };

  showMentions();
}

cmd.setRun(run);

module.exports = cmd;
