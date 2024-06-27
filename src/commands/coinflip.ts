import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
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
import {
  addBalance,
  calcMaxBet,
  getBalance,
  removeBalance,
} from "../utils/functions/economy/balance";
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
  .addUserOption((option) =>
    option.setName("user").setDescription("user you want to challenge").setRequired(false),
  )
  .addStringOption((option) =>
    option.setName("bet").setDescription("how much do you want to bet").setRequired(false),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("coinflip help")
      .setDescription("/coinflip user bet");

    return send({ embeds: [embed] });
  }

  const doGame = async (
    player1: GuildMember,
    player2: GuildMember,
    bet: number,
    response: ButtonInteraction,
  ) => {
    if (bet > (await getBalance(player2))) {
      await addBalance(player1.user.id, bet);
      return response.editReply({
        embeds: [new ErrorEmbed(`${player2.user.toString()} cannot afford this bet`)],
      });
    }

    await removeBalance(player2, bet);

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
    let thingy = `${player1.user.username}\n${player2.user.username}`;

    let winner: GuildMember;
    let loser: GuildMember;

    if (choice == "heads") {
      winner = player1;
      loser = player2;
    } else {
      winner = player2;
      loser = player1;
    }

    let winnings = bet * 2;
    let tax = 0;

    if (winnings > 1_000_000 && !(await isPremium(winner.user.id))) {
      tax = await getTax();

      const taxed = Math.floor(winnings * tax);
      await addToNypsiBank(taxed * 0.5);
      winnings -= taxed;
    }

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "coinflip",
      outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username}`,
      result: winner.user.id == message.author.id ? "win" : "lose",
      earned: winner.user.id == message.author.id ? winnings : null,
    });

    await createGame({
      userId: player2.user.id,
      bet: bet,
      game: "coinflip",
      outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username}`,
      result: winner.user.id == player2.user.id ? "win" : "lose",
      earned: winner.user.id == player2.user.id ? winnings : null,
    });

    gamble(winner.user, "coinflip", bet, "win", id, bet * 2);
    gamble(loser.user, "coinflip", bet, "lose", id);

    await addBalance(winner, winnings);

    const embed = new CustomEmbed(
      message.member,
      `*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`,
    ).setHeader("coinflip");

    const msg = await response.editReply({ embeds: [embed] });

    if (winner == message.member) {
      thingy = `**${message.author.username}** +$${winnings.toLocaleString()}${
        tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
      }\n${player2.user.username}`;
    } else {
      thingy = `${message.author.username}\n**${
        player2.user.username
      }** +$${winnings.toLocaleString()}${tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""}`;
    }

    embed.setDescription(
      `**winner** ${winner.user.username}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`,
    );
    embed.setColor(winner.displayHexColor);
    embed.setFooter({ text: `id: ${id}` });

    setTimeout(() => {
      return msg.edit({ embeds: [embed] });
    }, 2000);
  };

  if (args.length == 2) {
    const target = await getMember(message.guild, args[0]);

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
      return send({
        embeds: [new ErrorEmbed("this user is waiting for a response on a coinflip")],
      });

    if ((await isEcoBanned(target.user.id)).banned) {
      return send({ embeds: [new ErrorEmbed("they are banned. lol.")] });
    }

    if (!(await userExists(target))) await createUser(target);

    const memberMaxBet = (await calcMaxBet(message.member)) * 10;
    const targetMaxBet = (await calcMaxBet(target)) * 10;

    const bet = await formatBet(args[1], message.member, memberMaxBet);

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
      return send({
        embeds: [new ErrorEmbed(`**${target.user.username}** cannot afford this bet`)],
      });
    }

    if (bet > memberMaxBet)
      return send({
        embeds: [new ErrorEmbed(`your max bet is $**${memberMaxBet.toLocaleString()}**`)],
      });

    if (bet > targetMaxBet)
      return send({
        embeds: [new ErrorEmbed(`their max bet is $**${targetMaxBet.toLocaleString()}**`)],
      });

    await addCooldown(cmd.name, message.member, 10);
    playing.add(message.author.id);
    setTimeout(() => {
      if (playing.has(message.author.id)) playing.delete(message.author.id);
    }, 120000);

    await removeBalance(message.member, bet);
    let cancelled = false;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger),
    );

    const requestEmbed = new CustomEmbed(
      message.member,
      `**${
        message.author.username
      }** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\ndo you accept?`,
    ).setFooter({ text: "expires in 60 seconds" });

    const msg = await send({
      content: `${target.user.toString()} you have been invited to a coinflip worth $${bet.toLocaleString()}`,
      embeds: [requestEmbed],
      components: [row],
    });

    const filter = (i: Interaction) =>
      i.user.id == target.id ||
      (message.author.id === i.user.id && (i as ButtonInteraction).customId === "n");
    let fail = false;

    const response = await msg
      .awaitMessageComponent({ filter, time: 60000 })
      .then(async (collected) => {
        await collected.deferReply();
        msg.edit({ components: [] });
        playing.delete(message.author.id);
        return collected;
      })
      .catch(async () => {
        fail = true;
        playing.delete(message.author.id);
        if (!cancelled) await addBalance(message.member, bet);
        msg.edit({ components: [] });
      });

    if (fail || !response) return;

    if (response.customId == "y") {
      return doGame(message.member, target, bet, response as ButtonInteraction);
    } else {
      cancelled = true;
      await addBalance(message.member, bet);
      if (message.author.id === response.user.id) {
        response.editReply({
          embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
        });
      } else {
        response.editReply({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] });
      }
    }
  } else if (args.length == 1) {
    const memberMaxBet = (await calcMaxBet(message.member)) * 10;
    const bet = await formatBet(args[0], message.member, memberMaxBet);

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

    if (bet > memberMaxBet)
      return send({
        embeds: [new ErrorEmbed(`your max bet is $**${memberMaxBet.toLocaleString()}**`)],
      });

    await addCooldown(cmd.name, message.member, 10);
    playing.add(message.author.id);
    setTimeout(() => {
      if (playing.has(message.author.id)) playing.delete(message.author.id);
    }, 120000);

    await removeBalance(message.member, bet);
    let cancelled = false;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("play").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("n").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    const requestEmbed = new CustomEmbed(
      message.member,
      `**${
        message.author.username
      }** has created an open coinflip\n\n**bet** $${bet.toLocaleString()}`,
    ).setFooter({ text: "expires in 60 seconds" });

    const msg = await send({
      embeds: [requestEmbed],
      components: [row],
    });

    const filter = async (i: Interaction): Promise<boolean> => {
      if (i.user.id != message.author.id && (i as ButtonInteraction).customId == "n") return false;
      if ((await isEcoBanned(i.user.id)).banned) return false;

      if (i.user.id === message.author.id) {
        if ((i as ButtonInteraction).customId === "n") return true;
        return false;
      }

      if (!(await userExists(i.user.id)) || (await getBalance(i.user.id)) < bet) {
        if (i.isRepliable())
          await i.reply({
            ephemeral: true,
            embeds: [new ErrorEmbed("you cannot afford this bet")],
          });
        return false;
      }

      if ((await calcMaxBet(i.user.id)) * 10 < bet) {
        if (i.isRepliable())
          i.reply({
            embeds: [
              new ErrorEmbed(
                `your max bet is $**${((await calcMaxBet(i.user.id)) * 10).toLocaleString()}**`,
              ),
            ],
            ephemeral: true,
          });

        return false;
      }

      return true;
    };
    let fail = false;

    const response = await msg
      .awaitMessageComponent({ filter, time: 60000 })
      .then(async (collected) => {
        await collected.deferReply();
        msg.edit({ components: [] });
        playing.delete(message.author.id);
        return collected;
      })
      .catch(async () => {
        fail = true;
        playing.delete(message.author.id);
        if (!cancelled) await addBalance(message.member, bet);
        msg.edit({ components: [] });
      });

    if (fail || !response) return;

    const target = await message.guild.members.fetch(response.user.id);

    if (!target) return message.channel.send({ embeds: [new ErrorEmbed("invalid guild member")] });

    if (response.customId == "y") {
      return doGame(message.member, target, bet, response as ButtonInteraction);
    } else {
      cancelled = true;
      await addBalance(message.member, bet);
      if (message.author.id === response.user.id) {
        response.editReply({
          embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
        });
      } else {
        response.editReply({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] });
      }
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
