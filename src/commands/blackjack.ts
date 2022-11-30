import { variants } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import redis from "../init/redis";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import { calcMaxBet, getBalance, getDefaultBet, getMulti, updateBalance } from "../utils/functions/economy/balance.js";
import { createGame } from "../utils/functions/economy/stats";
import { addToGuildXP, getGuildByUser } from "../utils/functions/economy/guilds";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { calcEarnedXp, getXp, updateXp } from "../utils/functions/economy/xp";
import { isPremium } from "../utils/functions/premium/premium";
import { shuffle } from "../utils/functions/random";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, logger } from "../utils/logger";

const games = new Map<
  string,
  {
    bet: number;
    deck: string[];
    cards: string[];
    dealerCards: string[];
    id: number;
    first: boolean;
    dealerPlay: boolean;
    voted: number;
  }
>();

const cmd = new Command("blackjack", "play blackjack", Categories.MONEY).setAliases(["bj", "blowjob"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false)
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
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

  return prepareGame(message, args);
}

cmd.setRun(run);

module.exports = cmd;

async function prepareGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  msg?: Message
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (games.has(message.member.user.id)) {
    return send({ embeds: [new ErrorEmbed("you are already playing blackjack")] });
  }

  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("blackjack help")
      .addField("usage", "/blackjack <bet>")
      .addField(
        "game rules",
        "in blackjack, the aim is to get **21**, or as close as to **21** as you can get without going over\n" +
          "the dealer will always stand on or above **17**\n" +
          "**2**x multiplier for winning, on a draw you receive your bet back\n" +
          "if your first 2 cards add up to 21, you get a **2.5**x win"
      );

    return send({ embeds: [embed] });
  }

  if (args[0] == "info") {
    const embed = new CustomEmbed(
      message.member,
      "blackjack works exactly how it would in real life\n" +
        "when you create a game, a full 52 deck is shuffled in a random order\n" +
        "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
        "view the code for this [here](https://github.com/tekoh/nypsi/blob/main/src/commands/blackjack.ts)"
    ).setHeader("blackjack help");

    return send({ embeds: [embed] });
  }

  const maxBet = await calcMaxBet(message.member);

  const bet = (await formatBet(args[0], message.member).catch(() => {})) || defaultBet;

  if (!bet) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("invalid bet")] });
    } else {
      return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }
  }

  if (bet <= 0) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("/blackjack <bet>")] });
    } else {
      return send({ embeds: [new ErrorEmbed("/blackjack <bet>")] });
    }
  }

  if (bet > (await getBalance(message.member))) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
    } else {
      return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
    }
  }

  if (bet > maxBet) {
    if (msg) {
      return msg.edit({
        embeds: [
          new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`),
        ],
      });
    } else {
      return send({
        embeds: [
          new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 25);

  await updateBalance(message.member, (await getBalance(message.member)) - bet);

  const id = Math.random();

  const newDeck = [
    "A♠",
    "2♠",
    "3♠",
    "4♠",
    "5♠",
    "6♠",
    "7♠",
    "8♠",
    "9♠",
    "10♠",
    "J♠",
    "Q♠",
    "K♠",
    "A♣",
    "2♣",
    "3♣",
    "4♣",
    "5♣",
    "6♣",
    "7♣",
    "8♣",
    "9♣",
    "10♣",
    "J♣",
    "Q♣",
    "K♣",
    "A♥️",
    "2♥️",
    "3♥️",
    "4♥️",
    "5♥️",
    "6♥️",
    "7♥️",
    "8♥️",
    "9♥️",
    "10♥️",
    "J♥️",
    "Q♥️",
    "K♥️",
    "A♦",
    "2♦",
    "3♦",
    "4♦",
    "5♦",
    "6♦",
    "7♦",
    "8♦",
    "9♦",
    "10♦",
    "J♦",
    "Q♦",
    "K♦",
  ];

  const multi = await getMulti(message.member);

  games.set(message.member.user.id, {
    bet: bet,
    deck: shuffle(newDeck),
    cards: [],
    dealerCards: [],
    id: id,
    first: true,
    dealerPlay: false,
    voted: multi,
  });

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        games.delete(message.author.id);
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
      }
    }
  }, 180000);

  newDealerCard(message.member);
  newCard(message.member);
  newDealerCard(message.member);
  newCard(message.member);

  const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
    .setHeader("blackjack", message.author.avatarURL())
    .addField(
      "dealer",
      `${
        calcTotal(message.member) == 21
          ? `${getDealerCards(message.member)} **${calcTotalDealer(message.member)}**`
          : `| s${games.get(message.member.user.id).dealerCards[0]} |`
      }`
    )
    .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");

  let row;

  if ((await getBalance(message.member)) >= bet) {
    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("3️⃣").setLabel("double down").setStyle(ButtonStyle.Secondary)
    );
  } else {
    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary)
    );
  }

  if (calcTotal(message.member) == 21) row.components.forEach((c) => c.setDisabled(true));

  if (msg) {
    await msg.edit({ embeds: [embed], components: [row] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  playGame(message, msg, args).catch((e: string) => {
    logger.error(`error occured playing blackjack - ${message.author.tag} (${message.author.id})`);
    logger.error(e);
    message.channel.send({
      embeds: [new ErrorEmbed("an error occured while running - join support server")],
    });
  });
}

function newCard(member: GuildMember) {
  const bet = games.get(member.user.id).bet;
  const deck = games.get(member.user.id).deck;
  const cards = games.get(member.user.id).cards;
  const dealerCards = games.get(member.user.id).dealerCards;
  const id = games.get(member.user.id).id;
  const first = games.get(member.user.id).first;
  const voted = games.get(member.user.id).voted;

  const choice = deck[0];

  deck.shift();

  cards.push(choice);

  games.set(member.user.id, {
    bet: bet,
    deck: deck,
    cards: cards,
    dealerCards: dealerCards,
    id: id,
    first: first,
    dealerPlay: false,
    voted: voted,
  });
}

function newDealerCard(member: GuildMember) {
  const bet = games.get(member.user.id).bet;
  const deck = games.get(member.user.id).deck;
  const cards = games.get(member.user.id).cards;
  const dealerCards = games.get(member.user.id).dealerCards;
  const id = games.get(member.user.id).id;
  const first = games.get(member.user.id).first;
  const voted = games.get(member.user.id).voted;

  const choice = deck[0];

  deck.shift();

  dealerCards.push(choice);

  games.set(member.user.id, {
    bet: bet,
    deck: deck,
    cards: cards,
    dealerCards: dealerCards,
    id: id,
    first: first,
    dealerPlay: false,
    voted: voted,
  });
}

function calcTotal(member: GuildMember) {
  const cards = games.get(member.user.id).cards;

  let total = 0;
  let aces = 0;

  let aceAs11 = false;

  for (let card of cards) {
    card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join();

    if (card.includes("K") || card.includes("Q") || card.includes("J")) {
      total = total + 10;
    } else if (card.includes("A")) {
      aces++;
    } else {
      total = total + parseInt(card);
    }
  }

  for (let i = 0; i < aces; i++) {
    if (total < 11) {
      total += 11;
      aceAs11 = true;
    } else {
      total += 1;
    }
  }

  if (total > 21) {
    if (aceAs11) {
      total -= 10;
    }
  }

  return total;
}

function calcTotalDealer(member: GuildMember) {
  const cards = games.get(member.user.id).dealerCards;

  let total = 0;
  let aces = 0;

  let aceAs11 = false;

  for (let card of cards) {
    card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join();

    if (card.includes("K") || card.includes("Q") || card.includes("J")) {
      total = total + 10;
    } else if (card.includes("A")) {
      aces++;
    } else {
      total = total + parseInt(card);
    }
  }

  for (let i = 0; i < aces; i++) {
    if (total < 11) {
      total += 11;
      aceAs11 = true;
    } else {
      total += 1;
    }
  }

  if (total > 21) {
    if (aceAs11) {
      total -= 10;
    }
  }

  return total;
}

function getCards(member: GuildMember) {
  const cards = games.get(member.user.id).cards;

  return "| " + cards.join(" | ") + " |";
}

function getDealerCards(member: GuildMember) {
  const cards = games.get(member.user.id).dealerCards;

  return "| " + cards.join(" | ") + " |";
}

async function playGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  m: Message,
  args: string[]
): Promise<void> {
  if (!games.has(message.author.id)) return;

  const edit = async (data: MessageEditOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await m.edit(data);
    }
  };

  let bet = games.get(message.member.user.id).bet;
  const first = games.get(message.member.user.id).first;
  const dealerPlaya = games.get(message.member.user.id).dealerPlay;

  const newEmbed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString()).setHeader(
    "blackjack",
    message.author.avatarURL()
  );

  const replay = async (embed: CustomEmbed) => {
    if (!(await isPremium(message.member)) || (await getBalance(message.member)) < bet) {
      return m.edit({ embeds: [embed], components: [] });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("play again").setStyle(ButtonStyle.Success).setCustomId("rp")
    );

    await m.edit({ embeds: [embed], components: [row] });

    const res = await m
      .awaitMessageComponent({ filter: (i: Interaction) => i.user.id == message.author.id, time: 30000 })
      .catch(() => {
        m.edit({ components: [] });
        return;
      });

    if (res && res.customId == "rp") {
      await res.deferUpdate();
      logger.log({
        level: "cmd",
        message: `${message.guild.id} - ${message.author.tag}: replaying blackjack`,
      });
      if (isLockedOut(message.author.id)) return verifyUser(message);

      addHourlyCommand(message.member);

      await a(message.author.id, message.author.tag, message.content);

      await redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS, "blackjack", 1);

      return prepareGame(message, args, m);
    }
  };

  const lose = async () => {
    gamble(message.author, "blackjack", bet, false, 0);
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "blackjack",
      win: false,
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
    });
    newEmbed.setColor(Constants.EMBED_FAIL_COLOR);
    newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**you lose!!**");
    newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
    newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
    newEmbed.setFooter({ text: `id: ${id}` });
    games.delete(message.author.id);
    return replay(newEmbed);
  };

  const win = async () => {
    let winnings = bet * 2;

    if (games.get(message.author.id).cards.length == 2 && calcTotal(message.member) == 21) {
      winnings = Math.floor(bet * 2.5);
    }

    newEmbed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (games.get(message.member.user.id).voted > 0) {
      winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

      newEmbed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n\n**winner!!**\n**you win** $" +
          winnings.toLocaleString() +
          "\n" +
          "+**" +
          Math.floor(games.get(message.member.user.id).voted * 100).toString() +
          "**% bonus"
      );
    } else {
      newEmbed.setDescription(
        "**bet** $" + bet.toLocaleString() + "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString()
      );
    }

    const earnedXp = await calcEarnedXp(message.member, bet);

    if (earnedXp > 0) {
      await updateXp(message.member, (await getXp(message.member)) + earnedXp);
      newEmbed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildByUser(message.member);

      if (guild) {
        await addToGuildXP(guild.guildName, earnedXp, message.member);
      }
    }

    gamble(message.author, "blackjack", bet, true, winnings);
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "blackjack",
      win: true,
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
      earned: winnings,
      xp: earnedXp,
    });

    if (newEmbed.data.footer) {
      newEmbed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      newEmbed.setFooter({ text: `id: ${id}` });
    }

    newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
    newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
    await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    games.delete(message.author.id);
    return replay(newEmbed);
  };

  const draw = async () => {
    gamble(message.author, "blackjack", bet, true, bet);
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "blackjack",
      win: false,
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
    });
    newEmbed.setFooter({ text: `id: ${id}` });
    newEmbed.setColor(variants.macchiato.yellow.hex as ColorResolvable);
    newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString());
    newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
    newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
    await updateBalance(message.member, (await getBalance(message.member)) + bet);
    games.delete(message.author.id);
    return replay(newEmbed);
  };

  if (calcTotalDealer(message.member) > 21) {
    win();
    return;
  } else if (calcTotalDealer(message.member) == 21 && !first && dealerPlaya) {
    lose();
    return;
  } else if (calcTotal(message.member) == 21) {
    setTimeout(() => {
      dealerPlay(message);

      if (calcTotal(message.member) == calcTotalDealer(message.member)) {
        return draw();
      } else if (calcTotalDealer(message.member) > 21) {
        return win();
      } else if (calcTotalDealer(message.member) == 21) {
        return lose();
      } else if (calcTotal(message.member) == 21) {
        return win();
      } else {
        if (calcTotal(message.member) > calcTotalDealer(message.member)) {
          return win();
        } else {
          return lose();
        }
      }
    }, 1500);
    return;
  } else if (calcTotal(message.member) > 21) {
    lose();
    return;
  } else {
    games.set(message.member.user.id, {
      bet: bet,
      deck: games.get(message.member.user.id).deck,
      cards: games.get(message.member.user.id).cards,
      dealerCards: games.get(message.member.user.id).dealerCards,
      id: games.get(message.member.user.id).id,
      first: false,
      dealerPlay: false,
      voted: games.get(message.member.user.id).voted,
    });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    let fail = false;

    const reaction = await m
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(() => {
        fail = true;
        games.delete(message.author.id);
        message.channel.send({ content: message.author.toString() + " blackjack game expired" });
      });

    if (fail) return;

    if (reaction == "1️⃣") {
      newCard(message.member);

      if (calcTotal(message.member) > 21) {
        lose();
        return;
      }

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary)
      );

      if (calcTotal(message.member) == 21) {
        const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
          .setHeader("blackjack", message.author.avatarURL())
          .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
          .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");

        row.components.forEach((c) => c.setDisabled(true));
        await edit({ embeds: [newEmbed1], components: [row] });
        setTimeout(() => {
          dealerPlay(message);

          if (calcTotal(message.member) == calcTotalDealer(message.member)) {
            return draw();
          } else if (calcTotalDealer(message.member) > 21) {
            return win();
          } else if (calcTotalDealer(message.member) == 21) {
            return lose();
          } else if (calcTotal(message.member) == 21) {
            return win();
          } else {
            if (calcTotal(message.member) > calcTotalDealer(message.member)) {
              return win();
            } else {
              return lose();
            }
          }
        }, 1500);
        return;
      } else {
        const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
          .setHeader("blackjack", message.author.avatarURL())
          .addField("dealer", `| ${games.get(message.member.user.id).dealerCards[0]} |`)
          .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
        await edit({ embeds: [newEmbed1], components: [row] });
      }

      return playGame(message, m, args);
    } else if (reaction == "2️⃣") {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary).setDisabled(true)
      );

      const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("blackjack", message.author.avatarURL())
        .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");

      await edit({ embeds: [newEmbed1], components: [row] });

      games.set(message.member.user.id, {
        bet: bet,
        deck: games.get(message.member.user.id).deck,
        cards: games.get(message.member.user.id).cards,
        dealerCards: games.get(message.member.user.id).dealerCards,
        id: games.get(message.member.user.id).id,
        first: false,
        dealerPlay: true,
        voted: games.get(message.member.user.id).voted,
      });

      setTimeout(() => {
        dealerPlay(message);

        if (calcTotal(message.member) == calcTotalDealer(message.member)) {
          return draw();
        } else if (calcTotalDealer(message.member) > 21) {
          return win();
        } else if (calcTotalDealer(message.member) == 21) {
          return lose();
        } else if (calcTotal(message.member) == 21) {
          return win();
        } else {
          if (calcTotal(message.member) > calcTotalDealer(message.member)) {
            return win();
          } else {
            return lose();
          }
        }
      }, 1500);
    } else if (reaction == "3️⃣") {
      await updateBalance(message.member, (await getBalance(message.member)) - bet);

      bet = bet * 2;

      games.set(message.member.user.id, {
        bet: bet,
        deck: games.get(message.member.user.id).deck,
        cards: games.get(message.member.user.id).cards,
        dealerCards: games.get(message.member.user.id).dealerCards,
        id: games.get(message.member.user.id).id,
        first: false,
        dealerPlay: false,
        voted: games.get(message.member.user.id).voted,
      });

      newCard(message.member);

      const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("blackjack", message.author.avatarURL())
        .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
        .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
      await edit({ embeds: [newEmbed1], components: [] });

      if (calcTotal(message.member) > 21) {
        setTimeout(() => {
          return lose();
        }, 1500);
        return;
      }

      setTimeout(() => {
        dealerPlay(message);

        if (calcTotal(message.member) == calcTotalDealer(message.member)) {
          return draw();
        } else if (calcTotalDealer(message.member) > 21) {
          return win();
        } else if (calcTotalDealer(message.member) == 21) {
          return lose();
        } else if (calcTotal(message.member) == 21) {
          return win();
        } else {
          if (calcTotal(message.member) > calcTotalDealer(message.member)) {
            return win();
          } else {
            return lose();
          }
        }
      }, 1500);
    } else {
      games.delete(message.author.id);
      return;
    }
  }
}

function dealerPlay(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  while (calcTotalDealer(message.member) < 17) {
    newDealerCard(message.member);
  }
  return;
}
