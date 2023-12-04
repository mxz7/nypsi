import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { AchievementData } from "../types/Economy";
import { daysAgo } from "../utils/functions/date";
import {
  getAllAchievements,
  getCompletedAchievements,
  getUncompletedAchievements,
  getUserAchievement,
} from "../utils/functions/economy/achievements";
import { getAchievements, getItems, getTagsData } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("achievements", "view your achievement progress", "money").setAliases([
  "ach",
  "achievement",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((progress) =>
    progress.setName("progress").setDescription("view achievements in progress"),
  )
  .addSubcommand((all) => all.setName("all").setDescription("view all achievements"))
  .addSubcommand((show) =>
    show
      .setName("view")
      .setDescription("show information about a specific achievement")
      .addStringOption((option) =>
        option
          .setName("achievement")
          .setDescription("achievement you want to view")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 5);

  const showCurrentProgress = async () => {
    const allAchievementData = getAchievements();
    const achievements = await getUncompletedAchievements(message.author.id);

    if (!achievements || achievements.length == 0) {
      return showAllAchievements();
    }

    const desc: string[] = [];

    inPlaceSort(achievements).desc(
      (i) => (i.progress / allAchievementData[i.achievementId].target) * 100,
    );

    for (const achievement of achievements) {
      if (achievement.completed) continue;
      desc.push(
        `${allAchievementData[achievement.achievementId].emoji} ${
          allAchievementData[achievement.achievementId].name
        } \`${achievement.progress.toLocaleString()} / ${allAchievementData[
          achievement.achievementId
        ].target.toLocaleString()} (${(
          (achievement.progress / allAchievementData[achievement.achievementId].target) *
          100
        ).toFixed(1)}%)\``,
      );
    }

    if (desc.length == 0) return showAllAchievements();

    const pages = PageManager.createPages(desc);

    const completedAchievements = await getCompletedAchievements(message.member);

    const completion = `${(
      (completedAchievements.length / Object.keys(allAchievementData).length) *
      100
    ).toFixed(1)}% completion`;

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      "your achievement progress",
      message.author.avatarURL(),
    );

    embed.setFooter({ text: completion });

    if (pages.size == 1) return send({ embeds: [embed] });

    embed.setFooter({ text: `page 1/${pages.size} | ${completion}` });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      userId: message.author.id,
      embed,
      message: msg,
      row,
      pages,
      onPageUpdate(manager) {
        manager.embed.setFooter({
          text: `page ${manager.currentPage}/${manager.lastPage} | ${completion}`,
        });
        return manager.embed;
      },
    });

    return manager.listen();
  };

  const showAllAchievements = async () => {
    const allAchievements = getAchievements();
    const achievementIds = Object.keys(allAchievements);
    const usersAchievements = await getAllAchievements(message.author.id);
    const userAchievementIds = usersAchievements.map((i) => i.achievementId);

    inPlaceSort(achievementIds).asc();

    const pages = new Map<number, string[]>();

    for (const achievementId of achievementIds) {
      const achievement = allAchievements[achievementId];

      let str = `${achievement.emoji} ${achievement.name} `;

      if (userAchievementIds.includes(achievementId)) {
        const achData = usersAchievements.find((i) => i.achievementId == achievementId);

        if (!achData) continue;

        if (achData.completed) {
          str += `\`completed ${daysAgo(achData.completedAt).toLocaleString()} day${
            daysAgo(achData.completedAt) == 1 ? "" : "s"
          } ago\``;
        } else {
          str += `\`${achData.progress.toLocaleString()} / ${achievement.target.toLocaleString()} (${(
            (achData.progress / achievement.target) *
            100
          ).toFixed(1)}%)\``;
        }
      } else {
        str += `*${achievement.description}*`;
      }

      if (pages.size == 0) {
        pages.set(1, [str]);
      } else if (pages.get(pages.size).length >= 10) {
        pages.set(pages.size + 1, [str]);
      } else {
        const arr = pages.get(pages.size);
        arr.push(str);
      }
    }

    const completedAchievements = await getCompletedAchievements(message.member);

    const completion = `${(
      (completedAchievements.length / Object.keys(allAchievements).length) *
      100
    ).toFixed(1)}% completion`;

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
      .setHeader("all achievements", message.author.avatarURL())
      .setFooter({ text: `page 1/${pages.size} | ${completion}` });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    let msg: Message;

    if (pages.size == 1) {
      return await send({ embeds: [embed] });
    } else {
      msg = await send({ embeds: [embed], components: [row] });
    }

    const manager = new PageManager({
      pages,
      message: msg,
      embed,
      row,
      userId: message.author.id,
      onPageUpdate(manager) {
        manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
        return manager.embed;
      },
    });

    return manager.listen();
  };

  const showSpecificAchievement = async () => {
    args.shift();

    let selected: AchievementData;

    const allAchievementData = getAchievements();

    const searchTag = args.join(" ");

    for (const achievementId of Object.keys(allAchievementData)) {
      const achievement = allAchievementData[achievementId];

      if (searchTag.toLowerCase() == achievement.id) {
        selected = achievement;
        break;
      } else if (achievement.name.replaceAll("*", "").toLowerCase().includes(searchTag)) {
        selected = achievement;
        break;
      }
    }

    if (!selected) {
      return send({ embeds: [new ErrorEmbed("couldnt find that achievement")] });
    }

    const achievement = await getUserAchievement(message.author.id, selected.id);

    const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

    let desc = `\`${selected.id}\`\n\n*${selected.description}*\n\n`;

    if (achievement) {
      if (achievement.completed) {
        desc += `completed <t:${Math.floor(achievement.completedAt.getTime() / 1000)}:R>\n`;
      } else {
        desc += `${achievement.progress.toLocaleString()} / ${selected.target.toLocaleString()} (${(
          (achievement.progress / selected.target) *
          100
        ).toFixed(1)}%)\n`;
      }
    }

    const completed = await prisma.achievements.count({
      where: {
        AND: [{ achievementId: selected.id }, { completed: true }],
      },
    });

    if (completed > 0) {
      desc += `**${completed.toLocaleString()}** ${
        completed == 1 ? "person has" : "people have"
      } completed this achievement`;
    }

    embed.setDescription(desc);

    if (selected.prize) {
      embed.addField(
        "reward",
        selected.prize
          .map((prize) => {
            if (prize.startsWith("tag:")) {
              return `${getTagsData()[prize.split("tag:")[1]].emoji} ${
                getTagsData()[prize.split("tag:")[1]].name
              } tag`;
            } else {
              const amount = parseInt(prize.split(":")[1]);

              return `\`${amount}x\` ${getItems()[prize.split(":")[0]].emoji} ${
                getItems()[prize.split(":")[0]].name
              }`;
            }
          })
          .join("\n"),
      );
    }

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return showCurrentProgress();
  } else if (args[0].toLowerCase() == "progress") {
    return showCurrentProgress();
  } else if (args[0].toLocaleLowerCase() == "all") {
    return showAllAchievements();
  } else if (args[0].toLowerCase() == "show" || args[0].toLowerCase() == "view") {
    return showSpecificAchievement();
  }
}

cmd.setRun(run);

module.exports = cmd;
