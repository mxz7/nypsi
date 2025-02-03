import { flavors } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  ComponentType,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageCreateOptions,
  MessageEditOptions,
  WebhookClient,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { giveCaptcha, isLockedOut, verifyUser } from "../utils/functions/captcha";
import { addProgress } from "../utils/functions/economy/achievements";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  getDefaultBet,
  getGambleMulti,
  removeBalance,
} from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import { createGame } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import {
  createUser,
  formatBet,
  renderGambleScreen,
  userExists,
} from "../utils/functions/economy/utils.js";
import { addXp, calcEarnedGambleXp } from "../utils/functions/economy/xp";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { percentChance, shuffle } from "../utils/functions/random";
import sleep from "../utils/functions/sleep";
import { recentCommands } from "../utils/functions/users/commands";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, getTimestamp, logger } from "../utils/logger";

const cmd = new Command("blackjack", "play blackjack", "money").setAliases(["bj", "blowjob"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
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
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  return prepareGame(message, args);
}

cmd.setRun(run);

module.exports = cmd;

async function prepareGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  msg?: NypsiMessage,
  interaction?: ButtonInteraction,
): Promise<any> {
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

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({
        embeds: [new ErrorEmbed("you have an active game")],
        components: [],
      });
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
        "view the code for this [here](https://github.com/mxz7/nypsi/blob/main/src/commands/blackjack.ts)",
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
      return msg.edit({
        embeds: [new ErrorEmbed("you cannot afford this bet")],
      });
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
  await removeBalance(message.member, bet);

  const game = new Game(message, message.member, bet, msg, interaction);

  return game.play().catch((e) => {
    logger.error("bj error", e);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  });
}

class Game {
  private playerMessage: NypsiMessage | (NypsiCommandInteraction & CommandInteraction);
  private message: NypsiMessage;
  private member: GuildMember;
  private deck: string[];
  private bet: number;
  private originalBet: number;
  private hand: Hand;
  private dealer: Hand;
  private interaction: ButtonInteraction;
  private state: "playing" | "end";

  static getRow(doubleDown = true, disabled = false) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("hit")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("hit")
        .setDisabled(disabled),
      new ButtonBuilder()
        .setLabel("stand")
        .setStyle(ButtonStyle.Primary)
        .setCustomId("stand")
        .setDisabled(disabled),
    );

    if (doubleDown)
      row.addComponents(
        new ButtonBuilder()
          .setLabel("double down")
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("dd")
          .setDisabled(disabled),
      );

    return row;
  }

  constructor(
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    member: GuildMember,
    bet: number,
    msg?: NypsiMessage,
    interaction?: ButtonInteraction,
  ) {
    this.playerMessage = message;
    this.member = member;
    this.bet = bet;
    this.originalBet = bet;
    this.message = msg;
    this.interaction = interaction;
    this.state = "playing";

    setTimeout(() => {
      if (this.state === "playing") {
        logger.warn(
          "blackjack still in playing state after 5 minutes - deleting user from redis key",
          { user: this.member.user, game: this },
        );

        redis.srem(Constants.redis.nypsi.USERS_PLAYING, this.member.user.id);
      }
    }, 300000);

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

    this.hand = new Hand(this.deck);
    this.dealer = new Hand(this.deck);
    this.dealer.dealer = true;

    this.hand.newCard();
    this.dealer.newCard();
    this.hand.newCard();
    this.dealer.newCard();

    return this;
  }

  private async edit(data: MessageEditOptions) {
    if (!this.interaction || this.interaction.deferred || this.interaction.replied)
      return this.message.edit(data).catch(async (e) => {
        logger.error("bj edit error", e);
        const msg = (await this.message.channel.send(data as MessageCreateOptions)) as NypsiMessage;
        this.message = msg;
        return msg;
      });
    return this.interaction.update(data).catch(() =>
      this.message.edit(data).catch(async (e) => {
        logger.error("bj edit error", e);
        const msg = (await this.message.channel.send(data as MessageCreateOptions)) as NypsiMessage;
        this.message = msg;
        return msg;
      }),
    );
  }

  private checkWin() {
    if (this.hand.total() > 21) return "lose";
    if (this.dealer.total() > 21) return "win";
    if (this.hand.total() > this.dealer.total()) return "win";
    if (this.hand.total() < this.dealer.total()) return "lose";
    if (this.hand.total() === this.dealer.total()) return "draw";
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
    ).setHeader("blackjack", this.member.avatarURL() || this.member.user.avatarURL());

    if (state === "win") embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    else if (state === "lose") embed.setColor(Constants.EMBED_FAIL_COLOR);
    else if (state === "draw")
      embed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);

    if (xp && id) embed.setFooter({ text: `+${xp.toLocaleString()}xp | id: ${id}` });
    else if (id) embed.setFooter({ text: `id: ${id}` });

    embed.addField("dealer", this.dealer.render());
    embed.addField(this.member.user.username, this.hand.render());

    return embed;
  }

  private async end(result: "win" | "lose" | "draw") {
    this.state = "end";
    this.dealer.dealer = false;

    let winnings = 0;
    let xp = 0;
    const multi = await getGambleMulti(this.member);

    if (result === "win") {
      winnings = this.bet * 2;

      if (this.hand.cards.length === 2 && this.hand.total() === 21) {
        winnings = this.bet * 2.5;
        addProgress(this.member.user.id, "blackjack_pro", 1);
        addTaskProgress(this.member.user.id, "blackjack");
      }

      winnings = winnings + Math.floor(winnings * multi.multi);

      xp = await calcEarnedGambleXp(
        this.member,
        this.bet,
        this.hand.cards.length === 2 && this.hand.total() === 21 ? 2.5 : 2,
      );
    } else if (result === "draw") winnings = this.bet;

    if (winnings > 0) await addBalance(this.member, winnings);
    if (xp > 0) {
      await addXp(this.member, xp);

      const guild = await getGuildName(this.member);

      if (guild) {
        await addToGuildXP(guild, xp, this.member);
      }
    }

    const outcome = {
      dealer: { cards: this.dealer.cards, total: this.dealer.total() },
      player: { cards: this.hand.cards, total: this.hand.total() },
    };

    const id = await createGame({
      userId: this.member.user.id,
      game: "blackjack",
      bet: this.bet,
      result,
      outcome: JSON.stringify(outcome),
      earned: result === "win" ? winnings : null,
      xp: result === "win" ? xp : null,
    });
    gamble(this.member.user, "blackjack", this.bet, result, id, winnings);

    const embed = await this.render(result, winnings, multi.multi, xp, id);

    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, this.member.user.id);

    if (
      !(await isPremium(this.member)) ||
      !((await getTier(this.member)) >= 2) ||
      (await getBalance(this.member)) < this.bet
    ) {
      return this.edit({ embeds: [embed], components: [] });
    }

    if (percentChance(0.7)) {
      const res = await giveCaptcha(this.member.user.id);

      if (res) {
        logger.info(
          `${this.member.user.username} (${this.member.user.id}) given captcha randomly in blackjack`,
        );
        const hook = new WebhookClient({
          url: process.env.ANTICHEAT_HOOK,
        });
        await hook.send({
          content: `[${getTimestamp()}] ${this.member.user.username} (${this.member.user.id}) given captcha randomly in blackjack`,
        });
        hook.destroy();
      }
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("play again").setStyle(ButtonStyle.Success).setCustomId("rp"),
    );

    await this.edit({ embeds: [embed], components: [row] });

    const res = await this.message
      .awaitMessageComponent({
        filter: (i: Interaction) => i.user.id === this.member.user.id,
        time: 45000,
        componentType: ComponentType.Button,
      })
      .then((collected) => {
        setTimeout(() => {
          collected.deferUpdate().catch(() => {});
        }, 1000);

        return collected;
      })
      .catch(() => {
        this.edit({ components: [] });
        return;
      });

    if (res && res.customId == "rp") {
      this.interaction = res;
      logger.info(
        `::cmd ${this.message.guild.id} ${this.message.channelId} ${this.member.user.username}: replaying blackjack`,
      );
      if (await isLockedOut(this.member.user.id)) return verifyUser(this.playerMessage);

      addHourlyCommand(this.member);

      await a(
        this.member.user.id,
        this.member.user.username,
        this.playerMessage.content,
        "blackjack",
      );

      if (
        (await redis.get(
          `${Constants.redis.nypsi.RESTART}:${(this.message.client as NypsiClient).cluster.id}`,
        )) == "t"
      ) {
        if (this.member.user.id == Constants.TEKOH_ID && this.playerMessage instanceof Message) {
          this.playerMessage.react("💀");
        } else {
          return this.edit({
            embeds: [
              new CustomEmbed(this.member, "nypsi is rebooting, try again in a few minutes"),
            ],
          });
        }
      }

      if (await redis.get("nypsi:maintenance")) {
        if (this.member.user.id == Constants.TEKOH_ID && this.playerMessage instanceof Message) {
          this.playerMessage.react("💀");
        } else {
          return this.edit({
            embeds: [
              new CustomEmbed(
                this.member,
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        }
      }

      return prepareGame(
        this.playerMessage,
        [this.originalBet.toString()],
        this.message,
        this.interaction,
      );
    }
  }

  public async play() {
    if (this.hand.total() === 21) {
      this.dealer.dealer = false;
      const embed = await this.render("playing");
      const row = Game.getRow(false, true);
      if (this.message) {
        await this.edit({ embeds: [embed], components: [row] });
      } else {
        this.message = (await this.playerMessage.channel.send({
          embeds: [embed],
          components: [row],
        })) as NypsiMessage;
      }

      this.dealer.autoPlay();
      const check = this.checkWin();

      await sleep(1500);

      return this.end(check);
    }

    const embed = await this.render("playing");
    const row = Game.getRow((await getBalance(this.member)) >= this.bet);

    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(this.playerMessage instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (this.playerMessage.deferred) {
          res = await this.playerMessage.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await this.playerMessage.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await this.playerMessage.reply(data as InteractionReplyOptions).catch(() => {
            return (this.playerMessage as CommandInteraction).editReply(data).catch(async () => {
              usedNewMessage = true;
              return await this.playerMessage.channel.send(data as BaseMessageOptions);
            });
          });
        }

        if (usedNewMessage && res instanceof Message) return res;

        const replyMsg = await this.playerMessage.fetchReply();
        if (replyMsg instanceof Message) {
          return replyMsg;
        }
      } else {
        return await this.playerMessage.channel.send(data as BaseMessageOptions);
      }
    };

    if (!this.message)
      this.message = (await send({ embeds: [embed], components: [row] })) as NypsiMessage;
    else await this.edit({ embeds: [embed], components: [row] });

    return this.listen();
  }

  private async listen(): Promise<any> {
    let expire = false;
    const response = await this.message
      .awaitMessageComponent({
        filter: (i) => i.user.id === this.member.user.id,
        componentType: ComponentType.Button,
        time: 100000,
      })
      .then((collected) => {
        setTimeout(() => {
          collected.deferUpdate().catch(() => {});
        }, 1000);

        return collected;
      })
      .catch(() => {
        expire = true;
      });

    if (expire || !response) {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, this.member.user.id);
      return this.message.reply({
        content: `${this.member.toString()} blackjack game expired`,
      });
    }

    this.interaction = response;

    if (response.customId === "hit") {
      this.hand.newCard();

      const cont = this.checkContinue();
      if (cont === "lose") return this.end("lose");
      else if (cont === "end") {
        this.dealer.dealer = false;
        const embed = await this.render("playing");
        const row = Game.getRow(false, true);
        await this.edit({ embeds: [embed], components: [row] });

        this.dealer.autoPlay();
        const state = this.checkWin();

        await sleep(1500);
        return this.end(state);
      } else {
        const embed = await this.render("playing");
        const row = Game.getRow(false, false);
        await this.edit({ embeds: [embed], components: [row] });
        return this.listen();
      }
    } else if (response.customId === "stand") {
      this.dealer.dealer = false;
      const embed = await this.render("playing");
      const row = Game.getRow(false, true);

      await this.edit({ embeds: [embed], components: [row] });

      this.dealer.autoPlay();
      const state = this.checkWin();

      await sleep(1500);

      return this.end(state);
    } else if (response.customId === "dd") {
      const balance = await getBalance(this.member);

      if (balance >= this.bet && this.hand.cards.length === 2) {
        await removeBalance(this.member, this.bet);
        this.bet *= 2;
      }

      this.hand.newCard();

      const cont = this.checkContinue();
      if (cont === "lose") return this.end("lose");
      else {
        this.dealer.dealer = false;
        const embed = await this.render("playing");
        const row = Game.getRow(false, true);
        await this.edit({ embeds: [embed], components: [row] });

        this.dealer.autoPlay();
        const state = this.checkWin();

        await sleep(1500);
        return this.end(state);
      }
    }
  }

  private checkContinue() {
    if (this.hand.total() < 21) return "continue";
    else if (this.hand.total() > 21) return "lose";
    else return "end";
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

    return this;
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
    return `| ${this.cards.join(" | ")} | **${this.total()}**`;
  }
}
