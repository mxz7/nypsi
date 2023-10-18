import { variants } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
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
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import { addProgress } from "../utils/functions/economy/achievements";
import {
  calcMaxBet,
  getBalance,
  getDefaultBet,
  updateBalance,
} from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import { createGame } from "../utils/functions/economy/stats";
import {
  createUser,
  formatBet,
  renderGambleScreen,
  userExists,
} from "../utils/functions/economy/utils.js";
import { calcEarnedGambleXp, getXp, updateXp } from "../utils/functions/economy/xp";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { shuffle } from "../utils/functions/random";
import { recentCommands } from "../utils/functions/users/commands";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, logger } from "../utils/logger";

const games = new Map<
  string,
  {
    bet: number;
    deck: string[];
    hands: { cards: string[]; done: boolean }[];
    dealerCards: string[];
    id: number;
  }
>();

const cmd = new Command("blackjack", "play blackjack", "money").setAliases(["bj", "blowjob"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  return prepareGame(message, args);
}

cmd.setRun(run);

module.exports = cmd;

async function prepareGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  msg?: Message,
  interaction?: ButtonInteraction,
) {
  recentCommands.set(message.author.id, Date.now());

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

  if (games.has(message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you are already playing blackjack")] });
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
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
          "if your first 2 cards add up to 21, you get a **2.5**x win",
      );

    return send({ embeds: [embed] });
  }

  if (args[0] == "info") {
    const embed = new CustomEmbed(
      message.member,
      "blackjack works exactly how it would in real life\n" +
        "when you create a game, a full 52 deck is shuffled in a random order\n" +
        "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
        "view the code for this [here](https://github.com/tekoh/nypsi/blob/main/src/commands/blackjack.ts)",
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
          new ErrorEmbed(
            `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`,
          ),
        ],
      });
    } else {
      return send({
        embeds: [
          new ErrorEmbed(
            `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`,
          ),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 15);
  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  await updateBalance(message.member, (await getBalance(message.member)) - bet);

  const id = Math.random();

  games.set(message.author.id, {
    bet: bet,
    deck: shuffle(newDeck),
    hands: [{ cards: [], done: false }],
    dealerCards: [],
    id: id,
  });

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        games.delete(message.author.id);
        await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
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
          : `| ${games.get(message.author.id).dealerCards[0]} |`
      }`,
    )
    .addField(
      message.author.username,
      getCards(message.member) + " **" + calcTotal(message.member) + "**",
    );

  let row: ActionRowBuilder<MessageActionRowComponentBuilder>;

  if ((await getBalance(message.member)) >= bet) {
    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("3️⃣").setLabel("double down").setStyle(ButtonStyle.Secondary),
    );
  } else {
    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary),
    );
  }

  if (calcTotal(message.member) == 21) row.components.forEach((c) => c.setDisabled(true));

  if (interaction && !interaction.replied && !interaction.deferred) {
    await interaction.update({ embeds: [embed], components: [row] }).catch(() => {
      if (msg) {
        return msg.edit({ embeds: [embed], components: [row] });
      } else {
        return send({ embeds: [embed], components: [row] });
      }
    });
  } else {
    if (msg) {
      await msg.edit({ embeds: [embed], components: [row] });
    } else {
      msg = await send({ embeds: [embed], components: [row] });
    }
  }

  playGame(message, msg, args).catch((e) => {
    logger.error(
      `error occurred playing blackjack - ${message.author.username} (${message.author.id})`,
    );
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    console.trace();
    console.error(e);
    logger.error("bj error", e);
    message.channel.send({
      embeds: [new ErrorEmbed("an error occurred while running - join support server")],
    });
  });
}

class Game {
  private message: Message;
  private member: GuildMember;
  private deck: string[];
  private bet: number;
  private hands: Hand[];
  private dealerCards: Hand;
  private row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  private activeHand = 0;

  constructor(
    message: Message,
    member: GuildMember,
    bet: number,
    row: ActionRowBuilder<MessageActionRowComponentBuilder>,
  ) {
    this.message = message;
    this.member = member;
    this.bet = bet;
    this.row = row;

    this.deck = shuffle([
      "A♠️",
      "2♠️",
      "3♠️",
      "4♠️",
      "5♠️",
      "6♠️",
      "7♠️",
      "8♠️",
      "9♠️",
      "10♠️",
      "J♠️",
      "Q♠️",
      "K♠️",
      "A♣️",
      "2♣️",
      "3♣️",
      "4♣️",
      "5♣️",
      "6♣️",
      "7♣️",
      "8♣️",
      "9♣️",
      "10♣️",
      "J♣️",
      "Q♣️",
      "K♣️",
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
      "A♦️",
      "2♦️",
      "3♦️",
      "4♦️",
      "5♦️",
      "6♦️",
      "7♦️",
      "8♦️",
      "9♦️",
      "10♦️",
      "J♦️",
      "Q♦️",
      "K♦️",
    ]);

    this.hands = [new Hand(this.deck)];
    this.dealerCards = new Hand(this.deck);

    return this;
  }

  private checkWin(handIndex = 0) {
    const hand = this.hands[handIndex];

    if (hand.total() > 21) return "lose";
    if (this.dealerCards.total() > 21) return "win";
    if (hand.total() > this.dealerCards.total()) return "win";
    if (hand.total() < this.dealerCards.total()) return "lose";
    if (hand.total() === this.dealerCards.total()) return "draw";
  }

  private async render(
    state: "playing" | "win" | "lose" | "draw",
    winnings?: number,
    multi?: number,
    xp?: number,
    id?: string,
  ) {
    const embed = new CustomEmbed(
      this.member,
      await renderGambleScreen(this.member.user.id, state, this.bet, null, winnings, multi),
    );

    if (state === "win") embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    else if (state === "lose") embed.setColor(Constants.EMBED_FAIL_COLOR);
    else if (state === "draw") embed.setColor(variants.macchiato.yellow.hex as ColorResolvable);

    if (xp && id) embed.setFooter({ text: `+${xp.toLocaleString()}xp | id: ${id}` });
    else if (id) embed.setFooter({ text: `id: ${id}` });

    embed.addField("dealer", this.dealerCards.render());
    for (const hand of this.hands) {
      embed.addField(
        `${this.member.user.username}${
          this.activeHand === this.hands.indexOf(hand) && this.hands.length > 1 ? " (active)" : ""
        }`,
        hand.render(),
      );
    }
  }
}

class Hand {
  public cards: string[];
  public done: boolean;
  private deck: string[];
  public dealer: boolean;

  constructor(deck: string[], dealer = false) {
    this.cards = [];
    this.done = false;

    this.deck = deck;
    this.dealer = dealer;
  }

  public newCard() {
    const card = this.deck.shift();
    this.cards.push(card);

    return this;
  }

  public total() {
    let total = 0;
    let aces = 0;

    let aceAs11 = false;

    for (let card of this.cards) {
      card = card.split("♠️").join().split("♣️").join().split("♥️").join().split("♦️").join();

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

  public autoPlay() {
    while (this.total() < 17) this.newCard();

    return this;
  }

  public render() {
    if (this.dealer) return `| ${this.cards[0]} |`;
    return `| ${this.cards.join(" | ")} | **(${this.total()})**`;
  }
}

async function playGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  m: Message,
  args: string[],
): Promise<void> {
  if (!games.has(message.author.id)) return;

  const edit = async (data: MessageEditOptions, interaction?: ButtonInteraction) => {
    if (!interaction || interaction.deferred || interaction.replied) return m.edit(data);
    return interaction.update(data).catch(() => m.edit(data));
  };

  const game = games.get(message.author.id);

  const embed = new CustomEmbed(message.member, "**bet** $" + game.bet.toLocaleString()).setHeader(
    "blackjack",
    message.author.avatarURL(),
  );

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction) => {
    await redis.del(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    if (
      !(await isPremium(message.member)) ||
      !((await getTier(message.member)) >= 2) ||
      (await getBalance(message.member)) < game.bet
    ) {
      return edit({ embeds: [embed], components: [] }, interaction);
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("play again").setStyle(ButtonStyle.Success).setCustomId("rp"),
    );

    await edit({ embeds: [embed], components: [row] }, interaction);

    const res = await m
      .awaitMessageComponent({
        filter: (i: Interaction) => i.user.id == message.author.id,
        time: 30000,
      })
      .catch(() => {
        m.edit({ components: [] });
        return;
      });

    if (res && res.customId == "rp") {
      await res.deferUpdate();
      logger.info(`::cmd ${message.guild.id} ${message.author.username}: replaying blackjack`);
      if (await isLockedOut(message.author.id)) return verifyUser(message);

      addHourlyCommand(message.member);

      await a(message.author.id, message.author.username, message.content);

      if (
        (await redis.get(
          `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
        )) == "t"
      ) {
        if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
          message.react("💀");
        } else {
          return m.edit({
            embeds: [
              new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
            ],
          });
        }
      }

      if (await redis.get("nypsi:maintenance")) {
        if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
          message.react("💀");
        } else {
          return m.edit({
            embeds: [
              new CustomEmbed(
                message.member,
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        }
      }

      return prepareGame(message, args, m);
    }
  };

  const lose = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "blackjack",
      result: "lose",
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member,
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
    });
    gamble(message.author, "blackjack", game.bet, "lose", id, 0);
    embed.setColor(Constants.EMBED_FAIL_COLOR);
    embed.setDescription("**bet** $" + game.bet.toLocaleString() + "\n\n**you lose!!**");
    embed.addField(
      "dealer",
      getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
    );
    embed.addField(
      message.author.username,
      getCards(message.member) + " **" + calcTotal(message.member) + "**",
    );
    embed.setFooter({ text: `id: ${id}` });
    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const win = async (interaction?: ButtonInteraction) => {
    let winnings = 0;

    if (games.get(message.author.id).cards.length == 2 && calcTotal(message.member) == 21) {
      winnings = Math.floor(bet * 2.5);
      addProgress(message.author.id, "blackjack_pro", 1);
    }

    embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (games.get(message.author.id).voted > 0) {
      winnings = winnings + Math.round(winnings * games.get(message.author.id).voted);

      embed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n\n**winner!!**\n**you win** $" +
          winnings.toLocaleString() +
          "\n" +
          "+**" +
          Math.floor(games.get(message.author.id).voted * 100).toString() +
          "**% bonus",
      );
    } else {
      embed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n\n**winner!!**\n**you win** $" +
          winnings.toLocaleString(),
      );
    }

    const earnedXp = await calcEarnedGambleXp(message.member, bet, 2);

    if (earnedXp > 0) {
      await updateXp(message.member, (await getXp(message.member)) + earnedXp);
      embed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildName(message.member);

      if (guild) {
        await addToGuildXP(guild, earnedXp, message.member);
      }
    }

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "blackjack",
      result: "win",
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member,
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
      earned: winnings,
      xp: earnedXp,
    });

    gamble(message.author, "blackjack", bet, "win", id, winnings);
    if (earnedXp > 0) {
      embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      embed.setFooter({ text: `id: ${id}` });
    }

    embed.addField(
      "dealer",
      getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
    );
    embed.addField(
      message.author.username,
      getCards(message.member) + " **" + calcTotal(message.member) + "**",
    );
    await updateBalance(message.member, (await getBalance(message.member)) + winnings);

    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const draw = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "blackjack",
      result: "draw",
      outcome: `dealer cards: ${getDealerCards(message.member)} (${calcTotalDealer(
        message.member,
      )})\nmember cards: ${getCards(message.member)} (${calcTotal(message.member)})`,
      earned: bet,
    });
    gamble(message.author, "blackjack", bet, "draw", id, bet);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(variants.macchiato.yellow.hex as ColorResolvable);
    embed.setDescription(
      "**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString(),
    );
    embed.addField(
      "dealer",
      getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
    );
    embed.addField(
      message.author.username,
      getCards(message.member) + " **" + calcTotal(message.member) + "**",
    );
    await updateBalance(message.member, (await getBalance(message.member)) + bet);
    games.delete(message.author.id);
    return replay(embed, interaction);
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
    games.set(message.author.id, {
      bet: bet,
      deck: games.get(message.author.id).deck,
      cards: games.get(message.author.id).cards,
      dealerCards: games.get(message.author.id).dealerCards,
      id: games.get(message.author.id).id,
      first: false,
      dealerPlay: false,
      voted: games.get(message.author.id).voted,
    });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    let fail = false;

    const reaction = await m
      .awaitMessageComponent({ filter, time: 90000 })
      .then(async (collected) => {
        setTimeout(() => {
          collected.deferUpdate().catch(() => null);
        }, 750);
        return collected as ButtonInteraction;
      })
      .catch((e) => {
        logger.warn("bj error", e);
        fail = true;
        games.delete(message.author.id);
        message.channel.send({ content: message.author.toString() + " blackjack game expired" });
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      });

    if (fail || !reaction) return;

    if (reaction.customId == "1️⃣") {
      newCard(message.member);

      if (calcTotal(message.member) > 21) {
        lose(reaction);
        return;
      }

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary),
      );

      if (calcTotal(message.member) == 21) {
        const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
          .setHeader("blackjack", message.author.avatarURL())
          .addField(
            "dealer",
            getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
          )
          .addField(
            message.author.username,
            getCards(message.member) + " **" + calcTotal(message.member) + "**",
          );

        row.components.forEach((c) => c.setDisabled(true));
        await edit({ embeds: [newEmbed1], components: [row] }, reaction);
        setTimeout(() => {
          dealerPlay(message);

          if (calcTotal(message.member) == calcTotalDealer(message.member)) {
            return draw(reaction);
          } else if (calcTotalDealer(message.member) > 21) {
            return win(reaction);
          } else if (calcTotalDealer(message.member) == 21) {
            return lose(reaction);
          } else if (calcTotal(message.member) == 21) {
            return win(reaction);
          } else {
            if (calcTotal(message.member) > calcTotalDealer(message.member)) {
              return win(reaction);
            } else {
              return lose(reaction);
            }
          }
        }, 1500);
        return;
      } else {
        const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
          .setHeader("blackjack", message.author.avatarURL())
          .addField("dealer", `| ${games.get(message.author.id).dealerCards[0]} |`)
          .addField(
            message.author.username,
            getCards(message.member) + " **" + calcTotal(message.member) + "**",
          );
        await edit({ embeds: [newEmbed1], components: [row] }, reaction);
      }

      return playGame(message, m, args);
    } else if (reaction.customId == "2️⃣") {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("1️⃣")
          .setLabel("hit")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("2️⃣")
          .setLabel("stand")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
      );

      const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("blackjack", message.author.avatarURL())
        .addField(
          "dealer",
          getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
        )
        .addField(
          message.author.username,
          getCards(message.member) + " **" + calcTotal(message.member) + "**",
        );

      await edit({ embeds: [newEmbed1], components: [row] }, reaction);

      games.set(message.author.id, {
        bet: bet,
        deck: games.get(message.author.id).deck,
        cards: games.get(message.author.id).cards,
        dealerCards: games.get(message.author.id).dealerCards,
        id: games.get(message.author.id).id,
        first: false,
        dealerPlay: true,
        voted: games.get(message.author.id).voted,
      });

      setTimeout(() => {
        dealerPlay(message);

        if (calcTotal(message.member) == calcTotalDealer(message.member)) {
          return draw(reaction);
        } else if (calcTotalDealer(message.member) > 21) {
          return win(reaction);
        } else if (calcTotalDealer(message.member) == 21) {
          return lose(reaction);
        } else if (calcTotal(message.member) == 21) {
          return win(reaction);
        } else {
          if (calcTotal(message.member) > calcTotalDealer(message.member)) {
            return win(reaction);
          } else {
            return lose(reaction);
          }
        }
      }, 1500);
    } else if (reaction.customId == "3️⃣") {
      await updateBalance(message.member, (await getBalance(message.member)) - bet);

      bet = bet * 2;

      games.set(message.author.id, {
        bet: bet,
        deck: games.get(message.author.id).deck,
        cards: games.get(message.author.id).cards,
        dealerCards: games.get(message.author.id).dealerCards,
        id: games.get(message.author.id).id,
        first: false,
        dealerPlay: false,
        voted: games.get(message.author.id).voted,
      });

      newCard(message.member);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("1️⃣")
          .setLabel("hit")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("2️⃣")
          .setLabel("stand")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("3️⃣")
          .setLabel("double down")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("blackjack", message.author.avatarURL())
        .addField(
          "dealer",
          getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**",
        )
        .addField(
          message.author.username,
          getCards(message.member) + " **" + calcTotal(message.member) + "**",
        );
      await edit({ embeds: [newEmbed1], components: [row] }, reaction);

      if (calcTotal(message.member) > 21) {
        setTimeout(() => {
          return lose(reaction);
        }, 1500);
        return;
      }

      setTimeout(() => {
        dealerPlay(message);

        if (calcTotal(message.member) == calcTotalDealer(message.member)) {
          return draw(reaction);
        } else if (calcTotalDealer(message.member) > 21) {
          return win(reaction);
        } else if (calcTotalDealer(message.member) == 21) {
          return lose(reaction);
        } else if (calcTotal(message.member) == 21) {
          return win(reaction);
        } else {
          if (calcTotal(message.member) > calcTotalDealer(message.member)) {
            return win(reaction);
          } else {
            return lose(reaction);
          }
        }
      }, 1500);
    } else {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      games.delete(message.author.id);
      return;
    }
  }
}
