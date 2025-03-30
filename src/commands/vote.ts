import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getLastVote, getVoteStreak, hasVoted } from "../utils/functions/economy/vote";
import { getDmSettings } from "../utils/functions/users/notifications";

const cmd = new Command("vote", "vote every 12 hours to get rewards", "money");

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  let level = await getRawLevel(message.author.id);

  if (level > 100) level = 100;

  const amount = Math.floor(15000 * (level / 13 + 1));

  let xp = 15;

  xp += Math.floor((await getRawLevel(message.author.id)) * 0.3);

  if (xp > 100) xp = 100;

  const [voted, lastVote, votes, dmSettings, streak] = await Promise.all([
    hasVoted(message.member),
    getLastVote(message.member),
    prisma.economy.findUnique({
      where: { userId: message.author.id },
      select: { monthVote: true, seasonVote: true },
    }),
    getDmSettings(message.member),
    getVoteStreak(message.author.id),
  ]);

  const embed = new CustomEmbed(message.member);

  if (voted) {
    const nextVote = dayjs(lastVote).add(12, "hours").unix();
    embed.setHeader("thank you for voting", message.author.avatarURL());
    embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    embed
      .setDescription(
        `you can vote again <t:${nextVote}:R>${
          dmSettings.voteReminder
            ? ""
            : "\n\nenable vote reminders for an extra **2%** gamble multiplier and **5%** sell multiplier"
        }\n\nyou've voted **${votes.monthVote}** time${
          votes.monthVote === 1 ? "" : "s"
        } this month and **${votes.seasonVote}** time${
          votes.seasonVote === 1 ? "" : "s"
        } this season`,
      )
      .setFooter({ text: `streak: ${streak.toLocaleString()}` });

    if (dmSettings.voteReminder)
      send({
        embeds: [embed],
      });
    else
      send({
        embeds: [embed],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
            new ButtonBuilder()
              .setCustomId("enable-vote-reminders")
              .setStyle(ButtonStyle.Secondary)
              .setLabel("enable vote reminders"),
          ),
        ],
      });
  } else {
    embed.setHeader("vote for nypsi", message.author.avatarURL());
    embed.setColor(Constants.EMBED_FAIL_COLOR);
    embed
      .addField(
        "rewards",
        `- **3**% multiplier booster\n- +$**50k** max bet\n- $**${amount.toLocaleString()}** reward\n- **vote crates** (increase with your streak)`,
      )
      .setFooter({ text: `streak: ${streak.toLocaleString()}` });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL("https://top.gg/bot/678711738845102087/vote")
        .setLabel("top.gg")
        .setEmoji("<:topgg:1355915569286610964>"),
    );

    if (!dmSettings.voteReminder)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("enable-vote-reminders")
          .setStyle(ButtonStyle.Secondary)
          .setLabel("enable vote reminders"),
      );

    send({ embeds: [embed], components: [row] });
  }
}

cmd.setRun(run);

module.exports = cmd;
