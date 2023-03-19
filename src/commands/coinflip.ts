import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { createGame } from "../utils/functions/economy/stats";
import { createUser, formatBet, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member.js";
import { isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { getPreferences } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble } from "../utils/logger.js";

const cmd = new Command("coinflip", "flip a coin, double or nothing", "money").setAliases(["cf"]);

const playing = new Set<string>();

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) => option.setName("user").setDescription("user you want to challenge").setRequired(true))
  .addStringOption((option) => option.setName("bet").setDescription("how much do you want to bet"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

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

    return send({ embeds: [embed] });
  }

  if (args.length != 2) {
    const embed = new CustomEmbed(message.member).setHeader("coinflip help").setDescription("/coinflip user bet");

    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "t") args[0] = "tails";

  if (args[0].toLowerCase() == "h") args[0] = "heads";

  let target: GuildMember;

  if (!message.mentions.members.first()) {
    target = await getMember(message.guild, args[0]);
  } else {
    target = message.mentions.members.first();
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed("unable to find that member")] });
  }

  if (message.member == target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.bot) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (!(await getPreferences(target.user.id)).duelRequests) {
    return send({ embeds: [new ErrorEmbed(`${target.user.toString()} has requests disabled`)] });
  }

  if (playing.has(target.user.id))
    return send({ embeds: [new ErrorEmbed("this user is waiting for a response on a coinflip")] });

  if (await isEcoBanned(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("they are banned. lol.")] });
  }

  if (!(await userExists(target))) await createUser(target);

  const bet = await formatBet(args[1], message.member);

  if (!bet) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (isNaN(bet)) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (bet <= 0) {
    return send({ embeds: [new ErrorEmbed("/coinflip user bet")] });
  }

  if (bet > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
  }

  if (bet > (await getBalance(target))) {
    return send({ embeds: [new ErrorEmbed(`**${target.user.tag}** cannot afford this bet`)] });
  }

  await addCooldown(cmd.name, message.member, 10);
  playing.add(message.author.id);
  setTimeout(() => {
    if (playing.has(message.author.id)) playing.delete(message.author.id);
  }, 120000);

  await updateBalance(message.member, (await getBalance(message.member)) - bet);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger)
  );

  const requestEmbed = new CustomEmbed(
    message.member,
    `**${message.author.tag}** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\ndo you accept?`
  ).setFooter({ text: "expires in 60 seconds" });

  const m = await send({
    content: `${target.user.toString()} you have been invited to a coinflip worth $${bet.toLocaleString()}`,
    embeds: [requestEmbed],
    components: [row],
  });

  const filter = (i: Interaction) => i.user.id == target.id;
  let fail = false;

  const response = await m
    .awaitMessageComponent({ filter, time: 60000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      m.edit({ components: [] });
      playing.delete(message.author.id);
      return collected;
    })
    .catch(async () => {
      fail = true;
      playing.delete(message.author.id);
      await updateBalance(message.member, (await getBalance(message.member)) + bet);
      m.edit({ components: [] });
    });

  if (fail || !response) return;

  if (response.customId == "y") {
    if (bet > (await getBalance(target))) {
      return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
    }

    await updateBalance(target, (await getBalance(target)) - bet);

    // its big to make sure that theres little to no deviation in chance cus of rounding
    const lols = [
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
    ];
    const choice = lols[Math.floor(Math.random() * lols.length)];
    let thingy = `${message.author.username}\n${target.user.username}`;

    let winner: GuildMember;
    let loser: GuildMember;

    if (choice == "heads") {
      winner = message.member;
      loser = target;
    } else {
      winner = target;
      loser = message.member;
    }

    let winnings = bet * 2;
    let tax = 0;

    if (winnings > 1_000_000 && !(await isPremium(winner.user.id))) {
      tax = await getTax();

      const taxed = Math.floor(winnings * tax);
      await addToNypsiBank(taxed);
      winnings -= taxed;
    }

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "coinflip",
      outcome: `**winner** ${winner.user.tag}\n**loser** ${loser.user.tag}`,
      win: winner.user.id == message.author.id,
      earned: winner.user.id == message.author.id ? winnings : null,
    });

    await createGame({
      userId: target.user.id,
      bet: bet,
      game: "coinflip",
      outcome: `**winner** ${winner.user.tag}\n**loser** ${loser.user.tag}`,
      win: winner.user.id == target.user.id,
      earned: winner.user.id == target.user.id ? winnings : null,
    });

    gamble(winner.user, "coinflip", bet, true, id, bet * 2);
    gamble(loser.user, "coinflip", bet, false, id);

    await updateBalance(winner, (await getBalance(winner)) + winnings);

    const embed = new CustomEmbed(message.member, `*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`).setHeader(
      "coinflip"
    );

    const msg = await response.followUp({ embeds: [embed] });

    if (winner == message.member) {
      thingy = `**${message.author.username}** +$${winnings.toLocaleString()}${
        tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
      }\n${target.user.username}`;
    } else {
      thingy = `${message.author.username}\n**${target.user.username}** +$${winnings.toLocaleString()}${
        tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
      }`;
    }

    embed.setDescription(`**winner** ${winner.user.tag}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`);
    embed.setColor(winner.displayHexColor);
    embed.setFooter({ text: `id: ${id}` });

    setTimeout(() => {
      return msg.edit({ embeds: [embed] });
    }, 2000);
  } else {
    await updateBalance(message.member, (await getBalance(message.member)) + bet);
    response.followUp({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] });
  }
}

cmd.setRun(run);

module.exports = cmd;
