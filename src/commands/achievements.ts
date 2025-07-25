import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
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
import { pluralize } from "../utils/functions/string";
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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  const showCurrentProgress = async () => {
    const allAchievementData = getAchievements();
    const achievements = await getUncompletedAchievements(message.member);

    if (!achievements || achievements.length == 0) {
      return showAllAchievements();
    }

    const desc: string[] = [];

    inPlaceSort(achievements).desc(
      (i) => (Number(i.progress) / allAchievementData[i.achievementId].target) * 100,
    );

    for (const achievement of achievements) {
      if (achievement.completed) continue;
      desc.push(
        `${allAchievementData[achievement.achievementId].emoji} ${
          allAchievementData[achievement.achievementId].name
        } \`${achievement.progress.toLocaleString()} / ${allAchievementData[
          achievement.achievementId
        ].target.toLocaleString()} (${(
          (Number(achievement.progress) / allAchievementData[achievement.achievementId].target) *
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
    const usersAchievements = await getAllAchievements(message.member);
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
          str += `\`completed ${daysAgo(achData.completedAt).toLocaleString()} ${pluralize("day", daysAgo(achData.completedAt))} ago\``;
        } else {
          str += `\`${achData.progress.toLocaleString()} / ${achievement.target.toLocaleString()} (${(
            (Number(achData.progress) / achievement.target) *
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

    if (args.length == 0) {
      return send({ embeds: [new ErrorEmbed("/achievements view <achievement>")] });
    }

    let selected: AchievementData;

    const allAchievementData = getAchievements();

    let searchTag = args.join(" ").toLowerCase();

    const numerals = ["i", "ii", "iii", "iv", "v"];

    const digit = parseInt(searchTag.slice(-1));

    if (digit >= 1 && digit <= 5) {
      searchTag = searchTag.slice(0, -1) + numerals[digit - 1];
    }

    let numberProvided = false;

    for (const achievementId of Object.keys(allAchievementData)) {
      const achievement = allAchievementData[achievementId];

      if (searchTag == achievement.id) {
        selected = achievement;
        numberProvided = true;
        break;
      } else if (searchTag == achievement.id.substring(0, achievement.id.lastIndexOf("_"))) {
        selected = achievement;
        break;
      } else if (achievement.name.replaceAll("*", "").toLowerCase().includes(searchTag)) {
        selected = achievement;
        numberProvided = /^(i{1,3}|iv|v)$/.test(
          searchTag.split(" ")[searchTag.split(" ").length - 1],
        );
        break;
      }
    }

    if (!selected) {
      return send({ embeds: [new ErrorEmbed("couldnt find that achievement")] });
    }

    if (!numberProvided)
      selected =
        allAchievementData[
          (await getUncompletedAchievements(message.member)).find((i) =>
            i.achievementId.includes(selected.id.split("_")[0]),
          )?.achievementId
        ] || selected;

    const getAchievementEmbed = async (selected: AchievementData) => {
      const achievement = await getUserAchievement(message.member, selected.id);

      const embed = new CustomEmbed(message.member).setTitle(`${selected.emoji} ${selected.name}`);

      let desc = `\`${selected.id}\`\n\n*${selected.description}*\n\n`;

      if (achievement) {
        if (achievement.completed) {
          desc += `completed <t:${Math.floor(achievement.completedAt.getTime() / 1000)}:R>\n`;
        } else {
          desc += `${achievement.progress.toLocaleString()} / ${selected.target.toLocaleString()} (${(
            (Number(achievement.progress) / selected.target) *
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
        desc += `**${completed.toLocaleString()}** ${pluralize("person has", completed, "people have")} completed this achievement`;
      }

      embed.setDescription(desc);
      const prizes: string[] = [];

      if (selected.id.endsWith("_v")) {
        prizes.push("5,000xp");
        prizes.push("69420_crate:5");
      } else if (selected.id.endsWith("_iv")) {
        prizes.push("1,500xp");
        prizes.push("69420_crate:4");
      } else if (selected.id.endsWith("_iii")) {
        prizes.push("750xp");
        prizes.push("69420_crate:3");
      } else if (selected.id.endsWith("_ii")) {
        prizes.push("250xp");
      } else {
        prizes.push("100xp");
      }

      if (selected.prize) prizes.push(...selected.prize);

      embed.addField(
        "reward",
        prizes
          .map((prize) => {
            if (prize.startsWith("tag:")) {
              return `${getTagsData()[prize.split("tag:")[1]].emoji} ${
                getTagsData()[prize.split("tag:")[1]].name
              } tag`;
            } else if (getItems()[prize.split(":")[0]]) {
              const amount = parseInt(prize.split(":")[1]);

              return `\`${amount}x\` ${getItems()[prize.split(":")[0]].emoji} ${
                getItems()[prize.split(":")[0]].name
              }`;
            } else return prize;
          })
          .join("\n"),
      );

      return embed;
    };

    const getRow = (id: string) => {
      return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(tiers.indexOf(id) == 0),
        new ButtonBuilder()
          .setCustomId("➡")
          .setLabel("next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(tiers.indexOf(id) == tiers.length - 1),
      );
    };

    const tiers = Object.keys(allAchievementData).filter(
      (i) =>
        i.substring(0, i.lastIndexOf("_")) ==
        selected.id.substring(0, selected.id.lastIndexOf("_")),
    );

    const embed = await getAchievementEmbed(selected);

    if (tiers.length == 1) return send({ embeds: [embed] });

    let msg = await send({ embeds: [embed], components: [getRow(selected.id)] });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          await collected.deferUpdate().catch(() => {
            fail = true;
            return pageManager();
          });
          return { res: collected.customId };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ embeds: [embed], components: [] });
        });

      if (fail) return;
      if (!response) return;

      const { res } = response;

      if (res == "➡") {
        selected = allAchievementData[tiers[tiers.indexOf(selected.id) + 1]];
        const embed = await getAchievementEmbed(selected);

        msg = await msg.edit({ embeds: [embed], components: [getRow(selected.id)] });
        return pageManager();
      } else if (res == "⬅") {
        selected = allAchievementData[tiers[tiers.indexOf(selected.id) - 1]];
        const embed = await getAchievementEmbed(selected);

        msg = await msg.edit({ embeds: [embed], components: [getRow(selected.id)] });
        return pageManager();
      }
    };

    return pageManager();
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
