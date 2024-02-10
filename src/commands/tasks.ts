import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getTaskStreaks, getTasks } from "../utils/functions/economy/tasks";
import { getTasksData } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("tasks", "view your daily/weekly tasks", "money").setAliases([
  "objectives",
]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
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

  const tasks = await getTasks(message.author.id);
  const streaks = await getTaskStreaks(message.author.id);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("daily")
      .setLabel("daily")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("weekly").setLabel("weekly").setStyle(ButtonStyle.Secondary),
  );

  if (
    tasks.filter((i) => i.type === "daily").length ===
    tasks.filter((i) => i.type === "daily" && i.completed).length
  ) {
    (row.components[0] as ButtonBuilder).setStyle(ButtonStyle.Success);
  }

  if (
    tasks.filter((i) => i.type === "weekly").length ===
    tasks.filter((i) => i.type === "weekly" && i.completed).length
  ) {
    (row.components[1] as ButtonBuilder).setStyle(ButtonStyle.Success);
  }

  const dailies: { name: string; value: string }[] = [];
  const weeklies: { name: string; value: string }[] = [];

  const dailyEnd = dayjs()
    .add(1, "day")
    .set("hour", 0)
    .set("minute", 0)
    .set("second", 0)
    .set("millisecond", 0)
    .unix();

  const weeklyEnd = dayjs()
    .add(1, "week")
    .set("day", 1)
    .set("hour", 0)
    .set("minute", 0)
    .set("second", 0)
    .set("millisecond", 0)
    .unix();

  for (const task of tasks.filter((i) => i.type === "daily")) {
    dailies.push({
      name: getTasksData()[task.task_id].name,
      value:
        `${getTasksData()[task.task_id].description.replace("{x}", task.target.toLocaleString())}\n` +
        `${task.progress.toLocaleString()}/${task.target.toLocaleString()}`,
    });
  }

  for (const task of tasks.filter((i) => i.type === "weekly")) {
    weeklies.push({
      name: getTasksData()[task.task_id].name,
      value:
        `${getTasksData()[task.task_id].description.replace("{x}", task.target.toLocaleString())}\n` +
        `${task.progress.toLocaleString()}/${task.target.toLocaleString()}`,
    });
  }

  const embed = new CustomEmbed(message.member, `expires <t:${dailyEnd}:R>`)
    .setHeader(`${message.author.username}'s tasks`, message.author.avatarURL())
    .setFields(dailies);

  if (streaks.dailyTaskStreak > 0)
    embed.setFooter({ text: `streak: ${streaks.dailyTaskStreak} days` });

  const msg = await send({ embeds: [embed], components: [row] });

  const pageManager = async () => {
    const interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 60000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        row.components[0].setDisabled(true);
        row.components[1].setDisabled(true);
        msg.edit({ components: [row] });
      });

    if (!interaction) return;

    pageManager();

    if (interaction.customId === "daily") {
      embed.setFields(dailies);
      embed.setDescription(`expires <t:${dailyEnd}:R>`);
      embed.setHeader(`${message.author.username}'s daily tasks`, message.author.avatarURL());
      if (streaks.dailyTaskStreak > 0)
        embed.setFooter({ text: `streak: ${streaks.dailyTaskStreak}` });
      else delete embed.data.footer;
      row.components[0].setDisabled(true);
      row.components[1].setDisabled(false);
      interaction.update({ embeds: [embed], components: [row] });
    } else {
      embed.setFields(weeklies);
      embed.setDescription(`expires <t:${weeklyEnd}:R>`);
      embed.setHeader(`${message.author.username}'s weekly tasks`, message.author.avatarURL());
      if (streaks.weeklyTaskStreak > 0)
        embed.setFooter({ text: `streak: ${streaks.weeklyTaskStreak}` });
      else delete embed.data.footer;
      row.components[1].setDisabled(true);
      row.components[0].setDisabled(false);
      interaction.update({ embeds: [embed], components: [row] });
    }
  };
  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
