import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getLastVote, getVoteStreak, hasVoted } from "../utils/functions/economy/vote";
import { pluralize } from "../utils/functions/string";
import { getDmSettings } from "../utils/functions/users/notifications";

const cmd = new Command("vote", "vote every 12 hours to get rewards", "money");

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  let level = await getRawLevel(message.member);

  if (level > 100) level = 100;

  const amount = Math.floor(15000 * (level / 13 + 1));

  let xp = 15;

  xp += Math.floor((await getRawLevel(message.member)) * 0.3);

  if (xp > 100) xp = 100;

  const [voted, lastVote, votes, dmSettings, streak] = await Promise.all([
    hasVoted(message.member),
    getLastVote(message.member),
    prisma.economy.findUnique({
      where: { userId: message.author.id },
      select: { monthVote: true, seasonVote: true },
    }),
    getDmSettings(message.member),
    getVoteStreak(message.member),
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
        }\n\nyou've voted **${votes.monthVote}** ${pluralize("time", votes.monthVote)} this month and **${votes.seasonVote}** ${pluralize("time", votes.seasonVote)} this season`,
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
        .setLabel("vote here")
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
