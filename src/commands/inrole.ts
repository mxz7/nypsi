import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  Role,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("inrole", "get the members in a role", "utility");

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}inrole <role>`)] });
  }

  const roles = message.guild.roles.cache;

  let role: Role;

  if (message.mentions.roles.first()) {
    role = message.mentions.roles.first();
  } else if (!message.guild.roles.cache.get(args[0]) && parseInt(args[0])) {
    role = roles.find((r) => r.id == args[0]);
  } else {
    role = roles.find((r) => r.name.toLowerCase().includes(args.join(" ").toLowerCase()));
  }

  if (!role) {
    return message.channel.send({
      embeds: [new ErrorEmbed(`couldn't find the role \`${args.join(" ")}\``)],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  let members: Collection<string, GuildMember>;

  if (message.guild.memberCount == message.guild.members.cache.size) {
    members = message.guild.members.cache;
  } else {
    members = await message.guild.members.fetch().catch((e) => {
      logger.error("failed to fetch members for inrole cmd", e);
      return message.guild.members.cache;
    });
  }

  const memberList: string[] = [];

  members.forEach((m) => {
    if (m.roles.cache.has(role.id)) {
      memberList.push(`\`${m.user.username}\``);
    }
  });

  inPlaceSort(memberList).asc();

  const pages = PageManager.createPages(memberList, 10);

  if (!pages.get(1)) {
    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "that role has no members")],
    });
  }

  const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
    .setHeader(role.name + " [" + memberList.length.toLocaleString() + "]")
    .setFooter({ text: `page 1/${pages.size}` });

  let msg: Message;

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  if (pages.size >= 2) {
    msg = await message.channel.send({ embeds: [embed], components: [row] });
  } else {
    return await message.channel.send({ embeds: [embed] });
  }

  if (pages.size <= 1) return;

  let currentPage = 1;
  const lastPage = pages.size;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  async function pageManager(): Promise<void> {
    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await msg.edit({ components: [] });
      });

    if (!reaction) return;

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    } else if (reaction == "➡") {
      if (currentPage == lastPage) {
        return pageManager();
      } else {
        currentPage++;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage}` });
        if (currentPage == lastPage) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("➡")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    }
  }
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
