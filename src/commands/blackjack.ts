import { flavors } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
  OmitPartialGroupDMChannel,
  WebhookClient,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
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
import { addEventProgress } from "../utils/functions/economy/events";
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
import { escapeFormattingCharacters } from "../utils/functions/string";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { recentCommands } from "../utils/functions/users/commands";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, getTimestamp, logger } from "../utils/logger";
import ms = require("ms");

const cmd = new Command("blackjack", "play blackjack", "money").setAliases(["bj", "blowjob"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  return prepareGame(message, send, args);
}

cmd.setRun(run);

module.exports = cmd;

type Game = {
  id: number;
  bet: number;
  deck: string[];
  dealerHand: string[];
  playerHand: string[];
  playerDone: boolean;
  state: "playing" | "end";
};

async function prepareGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
  msg?: Message,
) {
  recentCommands.set(message.author.id, Date.now());

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
      return msg.edit({ embeds: [new ErrorEmbed("invalid bet")], components: [] });
    } else {
      return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }
  }

  if (bet <= 0) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("/blackjack <bet>")], components: [] });
    } else {
      return send({ embeds: [new ErrorEmbed("/blackjack <bet>")] });
    }
  }

  if (bet > (await getBalance(message.member))) {
    if (msg) {
      return msg.edit({
        embeds: [new ErrorEmbed("you cannot afford this bet")],
        components: [],
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
        components: [],
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

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  await addCooldown(cmd.name, message.member, 5);
  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  await removeBalance(message.member, bet);

  const id = Math.random();

  const newDeck = [
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
  ];

  const game: Game = {
    id,
    bet,
    deck: shuffle(newDeck),
    dealerHand: [],
    playerHand: [],
    playerDone: false,
    state: "playing",
  };

  setTimeout(() => {
    if (game.state == "playing" && game.id == id) {
      logger.warn(
        `blackjack: ${message.author.id} still in playing state after 5 minutes - deleting key`,
        game,
      );
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    }
  }, ms("5 minutes"));

  newCard(game.deck, game.playerHand);
  newCard(game.deck, game.dealerHand);
  newCard(game.deck, game.playerHand);
  newCard(game.deck, game.dealerHand);

  const row = getRow(
    (await getBalance(message.member)) >= bet && total(game.playerHand) < 21,
    total(game.playerHand) == 21,
  );

  const desc = await renderGambleScreen({ state: "playing", bet, userId: message.author.id });

  const embed = new CustomEmbed(message.member, desc).setHeader(
    "blackjack",
    message.author.avatarURL(),
  );

  embed.addField(
    "dealer",
    total(game.playerHand) == 21
      ? `| ${game.dealerHand.join(" | ")} | **${total(game.dealerHand)}**`
      : `| ${game.dealerHand[0]} |`,
  );
  embed.addField(
    message.member.user.username,
    `| ${game.playerHand.join(" | ")} | **${total(game.playerHand)}**`,
  );

  if (msg) {
    // const editedMsg = await msg.edit({ embeds: [embed], components: [row] });
    await msg.edit({ embeds: [embed], components: [row] });

    // try {
    //   logger.debug(`blackjack: ${message.member.id} message edited for replay, `, {
    //     id: editedMsg.id,
    //     embeds: editedMsg.embeds,
    //   });
    // } catch {
    //   logger.error(`blackjack: ${message.author.id} failed to get response from edit`);
    // }
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  playGame(game, message, send, msg, args);
}

function newCard(deck: string[], hand: string[]) {
  hand.push(deck.shift());
}

function total(hand: string[]) {
  let total = 0;
  let aces = 0;

  let aceAs11 = false;

  for (let card of hand) {
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

function getRow(doubleDown = true, disabled = false) {
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

async function playGame(
  game: Game,
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  m: Message,
  args: string[],
) {
  const bet = game.bet;

  const edit = async (
    data: MessageEditOptions,
    reason: string,
    interaction?: ButtonInteraction,
  ) => {
    let res: InteractionResponse<boolean> | OmitPartialGroupDMChannel<Message<boolean>>;

    logger.debug(`blackjack: ${message.author.id} message edited for ${reason}`);

    if (!interaction || interaction.deferred || interaction.replied) res = await m.edit(data);
    else
      res = await interaction.update(data).catch(() => {
        logger.error(`blackjack: ${message.author.id} update interaction failed, editing`);
        return m.edit(data);
      });

    // try {
    //   logger.debug(`blackjack: ${message.member.id} message edited for ${reason}`, {
    //     components: await res.fetch().then((m) => m.components),
    //   });
    // } catch {
    //   logger.error(`blackjack: ${message.author.id} failed to get response from edit`);
    // }

    return res;
  };

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction, retry = false) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    if (
      !(await isPremium(message.member)) ||
      !((await getTier(message.member)) >= 2) ||
      (await getBalance(message.member)) < bet
    ) {
      return edit({ embeds: [embed], components: [] }, "end", interaction);
    }

    if (
      percentChance(0.05) &&
      parseInt(await redis.get(`anticheat:interactivegame:count:${message.author.id}`)) > 100
    ) {
      const res = await giveCaptcha(message.member);

      if (res) {
        logger.info(
          `${message.member.user.username} (${message.author.id}) given captcha randomly in blackjack`,
        );
        const hook = new WebhookClient({
          url: process.env.ANTICHEAT_HOOK,
        });
        await hook.send({
          content: `[${getTimestamp()}] ${escapeFormattingCharacters(message.member.user.username)} (${message.author.id}) given captcha randomly in blackjack`,
        });
        hook.destroy();
      }
    }

    await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
    await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setLabel("play again").setStyle(ButtonStyle.Success).setCustomId("rp"),
    );

    await edit(
      { embeds: [embed], components: [row] },
      "replay prep",
      retry ? undefined : interaction,
    );

    const res = await m
      .awaitMessageComponent({
        filter: (i: Interaction) => i.user.id == message.author.id,
        time: 30000,
      })
      .catch(() => {
        m.edit({ components: [] });
        return;
      });

    // logger.debug(
    //   `blackjack: ${message.author.id} received replay response: ${res ? res.customId : null}`,
    // );

    if (res && res.customId == "rp") {
      await res.deferUpdate().catch(() => {
        logger.warn(`blackjack: ${message.author.id} failed to defer update for replay`);
      });
      logger.info(
        `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying blackjack`,
        { userId: message.author.id, guildId: message.guildId, channelId: message.channelId },
      );
      if (await isLockedOut(message.member)) return verifyUser(message);

      addHourlyCommand(message.member);

      await a(message.author.id, message.author.username, message.content, "blackjack");

      if (
        (await redis.get(
          `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
        )) == "t"
      ) {
        if (message.author.id == Constants.OWNER_ID && message instanceof Message) {
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
        if (
          (await hasAdminPermission(message.member, "bypass-maintenance")) &&
          message instanceof Message
        ) {
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

      return prepareGame(message, send, args, m);
    } else if (res) {
      logger.warn(
        `blackjack: ${message.author.id} received invalid interaction for replay view: ${res.customId}`,
      );
      return replay(embed, interaction, true);
    }
  };

  const checkWin = () => {
    if (total(game.playerHand) > 21) return "lose";
    if (total(game.dealerHand) > 21) return "win";
    if (total(game.playerHand) > total(game.dealerHand)) return "win";
    if (total(game.playerHand) < total(game.dealerHand)) return "lose";
    if (total(game.playerHand) == total(game.dealerHand)) return "draw";
  };

  const render = async (
    state: "playing" | "win" | "lose" | "draw",
    winnings?: number,
    multi?: number,
    xp?: number,
    id?: string,
    eventProgress?: number,
  ) => {
    const embed = new CustomEmbed(
      message.member,
      await renderGambleScreen({
        // @ts-expect-error overloads
        state,
        bet: game.bet,
        winnings,
        multiplier: multi,
        eventProgress,
        userId: message.author.id,
      }),
    ).setHeader("blackjack", message.member.avatarURL() || message.member.user.avatarURL());

    if (state === "win") embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    else if (state === "lose") embed.setColor(Constants.EMBED_FAIL_COLOR);
    else if (state === "draw")
      embed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);

    if (xp && id) embed.setFooter({ text: `+${xp.toLocaleString()}xp | id: ${id}` });
    else if (id) embed.setFooter({ text: `id: ${id}` });

    embed.addField(
      "dealer",
      game.playerDone
        ? `| ${game.dealerHand.join(" | ")} | **${total(game.dealerHand)}**`
        : `| ${game.dealerHand[0]} |`,
    );
    embed.addField(
      message.member.user.username,
      `| ${game.playerHand.join(" | ")} | **${total(game.playerHand)}**`,
    );

    return embed;
  };

  const handOutcome = () => {
    return JSON.stringify({
      dealer: {
        cards: game.dealerHand,
        total: total(game.dealerHand),
      },
      player: {
        cards: game.playerHand,
        total: total(game.playerHand),
      },
    });
  };

  const lose = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      game: "blackjack",
      bet: game.bet,
      result: "lose",
      outcome: handOutcome(),
    });
    gamble(message.author, "blackjack", game.bet, "lose", id, 0);

    const embed = await render("lose", undefined, undefined, undefined, id);
    game.state = "end";
    return replay(embed, interaction);
  };

  const win = async (interaction?: ButtonInteraction) => {
    const eventProgress = await addEventProgress(
      message.client as NypsiClient,
      message.member,
      "blackjack",
      1,
    );

    let winnings = game.bet * 2;

    const multi = (await getGambleMulti(message.member, message.member.client as NypsiClient))
      .multi;

    if (game.playerHand.length === 2 && total(game.playerHand) === 21) {
      winnings = game.bet * 2.5;
      addProgress(message.member, "blackjack_pro", 1);
      addTaskProgress(message.member, "blackjack");
    }

    winnings = Math.floor(winnings + winnings * multi);

    const earnedXp = await calcEarnedGambleXp(
      message.member,
      message.client as NypsiClient,
      game.bet,
      game.playerHand.length === 2 && total(game.playerHand) === 21 ? 2.5 : 2,
    );

    if (earnedXp > 0) {
      await addXp(message.member, earnedXp);

      const guild = await getGuildName(message.member);

      if (guild) {
        await addToGuildXP(guild, earnedXp, message.member);
      }
    }

    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "blackjack",
      result: "win",
      outcome: handOutcome(),
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "blackjack", game.bet, "win", id, winnings);

    await addBalance(message.member, winnings);

    const embed = await render("win", winnings, multi, earnedXp, id, eventProgress);

    game.state = "end";
    return replay(embed, interaction);
  };

  const draw = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "blackjack",
      result: "draw",
      outcome: handOutcome(),
      earned: game.bet,
    });
    gamble(message.author, "blackjack", game.bet, "draw", id, game.bet);
    await addBalance(message.member, game.bet);
    const embed = await render("draw", game.bet, undefined, undefined, id);

    game.state = "end";
    return replay(embed, interaction);
  };

  const checkContinue = () => {
    if (total(game.playerHand) < 21) return "continue";
    else if (total(game.playerHand) > 21) return "lose";
    else return "end";
  };

  const playerDone = async (interaction?: ButtonInteraction, skipFirstEdit = false) => {
    game.playerDone = true;

    if (!skipFirstEdit) {
      const embed = await render("playing");
      const row = getRow(false, true);

      await edit({ embeds: [embed], components: [row] }, "player done", interaction);
    }

    while (total(game.dealerHand) < 17) {
      newCard(game.deck, game.dealerHand);
    }

    const check = checkWin();

    await sleep(1500);

    switch (check) {
      case "lose":
        return lose();
      case "win":
        return win();
      case "draw":
        return draw();
    }
  };

  if (total(game.playerHand) == 21) {
    return playerDone(undefined, true);
  }

  const listen = async () => {
    const filter = (i: Interaction) => i.user.id == message.author.id;

    let fail = false;

    const reaction = await m
      .awaitMessageComponent({ filter, time: 90000 })
      .then(async (collected) => {
        setTimeout(() => {
          if (!collected.deferred && !collected.replied) {
            collected.deferUpdate().catch((e) => {
              logger.error(`blackjack: ${message.author.id} failed to defer update`, e);
              console.error(e);
            });
          }
        }, 2000);
        return collected as ButtonInteraction;
      })
      .catch((e) => {
        logger.warn(`blackjack: ${message.author.id} interaction error`, e);
        fail = true;
        game.state = "end";
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        message.channel.send({ content: message.author.toString() + " blackjack game expired" });
      });

    if (fail || !reaction) return;

    if (reaction.customId === "hit") {
      newCard(game.deck, game.playerHand);

      const cont = checkContinue();
      if (cont === "lose") {
        game.playerDone = true;
        return lose(reaction);
      } else if (cont === "end") await playerDone(reaction);
      else {
        const embed = await render("playing");
        const row = getRow(false, false);
        await edit({ embeds: [embed], components: [row] }, "hit", reaction);
        return listen();
      }
    } else if (reaction.customId === "stand") {
      await playerDone(reaction);
    } else if (reaction.customId === "dd") {
      const balance = await getBalance(message.member);

      if (balance >= bet && game.playerHand.length === 2) {
        await removeBalance(message.member, bet);

        game.bet *= 2;
      }

      newCard(game.deck, game.playerHand);

      const cont = checkContinue();
      if (cont === "lose") {
        game.playerDone = true;
        return lose(reaction);
      } else return playerDone(reaction);
    } else if (reaction.customId === "rp") {
      const embed = await render("playing");

      let doubleDown = false;

      if (game.playerHand.length === 2 && game.dealerHand.length === 2) {
        doubleDown = true;
      }

      const row = getRow(doubleDown, false);
      await edit({ embeds: [embed], components: [row] }, "rerender", reaction);
      return listen();
    }
  };

  return listen();
}
