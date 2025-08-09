import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { percentChance } from "../utils/functions/random";
import { addMarriage, isMarried, removeMarriage } from "../utils/functions/users/marriage";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cache = new Map<string, number>();

const cmd = new Command("love", "calculate your love with another person", "fun");

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("user").setDescription("is this person your one true love?!"),
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

  const prefix = (await getPrefix(message.guild))[0];

  let target1;
  let target2;

  if (args.length == 0) {
    target1 = message.member;

    const members: string[] = [];
    const members1 = message.guild.members.cache;

    members1.forEach((m) => {
      if (!m.user.bot) {
        members.push(m.user.id);
      }
    });

    target2 = members[Math.floor(Math.random() * members.length)];

    target2 = await message.guild.members.fetch(target2);
  } else if (args.length == 1) {
    target1 = message.member;

    if (!message.mentions.members.first()) {
      target2 = await getMember(message.guild, args[0]);
    } else {
      target2 = message.mentions.members.first();
    }
  } else {
    if (message.mentions.members.size == 2) {
      target1 = message.mentions.members.first();

      target2 = message.mentions.members.get(Array.from(message.mentions.members.keys())[1]);
    } else if (message.mentions.members.size == 1) {
      if (args[0].startsWith("<@")) {
        target1 = message.mentions.members.first();

        target2 = await getMember(message.guild, args[1]);
      } else {
        target2 = message.mentions.members.first();

        target1 = await getMember(message.guild, args[0]);
      }
    } else if (message.mentions.members.size == 0) {
      target1 = await getMember(message.guild, args[0]);
      target2 = await getMember(message.guild, args[1]);
    } else {
      return send({ embeds: [new ErrorEmbed(`${prefix}love <user> (user)`)] });
    }
  }

  if (!target1 || !target2) {
    return send({ embeds: [new ErrorEmbed("invalid user(s)")] });
  }

  await addCooldown(cmd.name, message.member, 10);

  const combo = (parseInt(target1.user.id) + parseInt(target2.user.id)).toString();

  let lovePercent;

  if (cache.has(combo)) {
    lovePercent = cache.get(combo);
  } else {
    lovePercent = Math.ceil(Math.random() * 101) - 1;

    cache.set(combo, lovePercent);

    setTimeout(() => {
      cache.delete(combo);
    }, 60000);
  }

  let loveLevel;
  let loveEmoji;
  let loveBar = "";

  if (target1 == target2) {
    lovePercent = 0;
  }

  if (lovePercent === 100 && percentChance(50)) {
    lovePercent = 99;
  }

  if (lovePercent == 100) {
    loveLevel = "perfect!!";
    loveEmoji = "💞👀🍆🍑";
  } else if (lovePercent == 69) {
    loveLevel = "ooo 69 hehe horny";
    loveEmoji = "🍆🍑💦😩";
  } else if (lovePercent > 90) {
    loveLevel = "perfect!!";
    loveEmoji = "💞👀";
  } else if (lovePercent > 75) {
    loveLevel = "amazing!!";
    loveEmoji = "💕";
  } else if (lovePercent > 55) {
    loveLevel = "good";
    loveEmoji = "💖";
  } else if (lovePercent > 40) {
    loveLevel = "okay";
    loveEmoji = "💝";
  } else if (lovePercent > 25) {
    loveLevel = "uhh..";
    loveEmoji = "❤️";
  } else if (lovePercent < 5 && lovePercent != 0) {
    loveLevel = "alone forever";
    loveEmoji = "😭";
  } else if (lovePercent == 0) {
    loveLevel = "lol loner";
    loveEmoji = "😭";
  } else {
    loveLevel = "lets not talk about it..";
    loveEmoji = "💔";
  }

  const loveBarNum = Math.ceil(lovePercent / 10) * 10;

  if (loveBarNum == 100) {
    loveBar = "**❤️❤️❤️❤️❤️❤️❤️❤️❤️**";
  } else if (loveBarNum >= 90) {
    loveBar = "**❤️❤️❤️❤️❤️❤️❤️❤️❤️** 💔";
  } else if (loveBarNum >= 80) {
    loveBar = "**❤️❤️❤️❤️❤️❤️❤️❤️** 💔💔";
  } else if (loveBarNum >= 70) {
    loveBar = "**❤️❤️❤️❤️❤️❤️❤️** 💔💔💔";
  } else if (loveBarNum >= 60) {
    loveBar = "**❤️❤️❤️❤️❤️❤️** 💔💔💔💔";
  } else if (loveBarNum >= 50) {
    loveBar = "**❤️❤️❤️❤️❤️** 💔💔💔💔💔";
  } else if (loveBarNum >= 40) {
    loveBar = "**❤️❤️❤️❤️** 💔💔💔💔💔💔";
  } else if (loveBarNum >= 30) {
    loveBar = "**❤️❤️❤️** 💔💔💔💔💔💔💔";
  } else if (loveBarNum >= 20) {
    loveBar = "**❤️❤️** 💔💔💔💔💔💔";
  } else if (loveBarNum >= 10) {
    loveBar = "**❤️** 💔💔💔💔💔💔💔";
  } else {
    loveBar = "💔💔💔💔💔💔💔💔💔💔";
  }

  let desc =
    `${target1.user.username.replaceAll("_", "\\_")} **x** ${target2.user.username.replaceAll("_", "\\_")}\n\n` +
    `${loveBar}\n**${lovePercent}**% **-** ${loveLevel} ${loveEmoji}`;

  let marriage = await isMarried(message.member);
  let marryOpportunity = false;

  const target =
    target1.id === message.author.id
      ? target2
      : target2.id === message.author.id
        ? target1
        : undefined;

  if (
    marriage &&
    lovePercent === 100 &&
    target &&
    !(await isMarried(target)) &&
    (target1.id === message.author.id || target2.id === message.author.id)
  ) {
    await removeMarriage(message.member);
    await addInventoryItem(marriage.partnerId, "broken_ring", 1);

    addNotificationToQueue({
      memberId: marriage.partnerId,
      payload: {
        embed: new CustomEmbed(
          marriage.partnerId,
          `${getItems()["broken_ring"].emoji} **${message.member.user.username.replaceAll("_", "\\_")}** has cheated on you!`,
        ).setFooter({ text: `+1 broken ring` }),
      },
    });

    desc += `\n\n${getItems()["broken_ring"].emoji} you cheated on **${await getLastKnownUsername(marriage.partnerId, true)}**!`;

    marriage = false;
  }

  if (
    !marriage &&
    lovePercent === 100 &&
    !(await isMarried(target1)) &&
    !(await isMarried(target2)) &&
    target &&
    target.user.id !== message.author.id &&
    (target1.id === message.author.id || target2.id === message.author.id)
  ) {
    marryOpportunity = true;
  }

  addProgress(message.member, "unsure", 1);

  const embed = new CustomEmbed(message.member, desc);

  if (!marryOpportunity) {
    send({ embeds: [embed] });
    return;
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("love-marry")
      .setLabel("get married! (0/2)")
      .setStyle(ButtonStyle.Success),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000,
    filter: (i) => {
      if (i.user.id === target1.user.id || i.user.id === target2.user.id) return true;
      i.reply({
        embeds: [new ErrorEmbed("this isn't for you IDIOT")],
        flags: MessageFlags.Ephemeral,
      });
    },
  });

  const clicked: string[] = [];
  let ended = false;

  collector.on("end", async () => {
    if (ended) return;

    row.components[0].setDisabled(true);

    await msg.edit({ components: [row] });
  });

  collector.on("collect", async (i) => {
    if (ended) return;
    if (clicked.includes(i.user.id)) return;

    clicked.push(i.user.id);

    if (clicked.length === 1) {
      (row.components[0] as ButtonBuilder).setLabel("get married! (1/2)");
      return i.update({ components: [row] });
    }

    ended = true;
    collector.stop();

    (row.components[0] as ButtonBuilder).setLabel("get married! (2/2)").setDisabled(true);
    await i.update({ components: [row] });

    const target1Marriage = await isMarried(target1);
    const target2Marriage = await isMarried(target2);

    if (target1Marriage || target2Marriage) {
      return i.followUp({
        embeds: [new ErrorEmbed("some trickery has gone on and you can't be married... cunts")],
      });
    }

    await addMarriage(target1.user.id, target2.user.id);

    return i.followUp({
      embeds: [new CustomEmbed(message.member, "you may now kiss the bride!")],
    });
  });
}

cmd.setRun(run);

module.exports = cmd;
