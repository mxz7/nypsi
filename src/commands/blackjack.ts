import { flavors } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
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

const games = new Map<
  string,
  {
    id: number;
    bet: number;
    deck: string[];
    dealerHand: string[];
    playerHand: string[];
    playerDone: boolean;
  }
>();

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

  if (games.has(message.author.id)) {
    if (msg) {
      return msg.edit({
        embeds: [new ErrorEmbed("you are already playing blackjack")],
        components: [],
      });
    } else {
      return send({ embeds: [new ErrorEmbed("you are already playing blackjack")] });
    }
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  await addCooldown(cmd.name, message.member, 10);
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

  setTimeout(() => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        const game = games.get(message.author.id);
        games.delete(message.author.id);
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        logger.warn("blackjack still in playing state after 5 minutes - deleting key", game);
      }
    }
  }, ms("5 minutes"));

  games.set(message.author.id, {
    id,
    bet,
    deck: shuffle(newDeck),
    dealerHand: [],
    playerHand: [],
    playerDone: false,
  });

  newCard(message.member, "player");
  newCard(message.member, "dealer");
  newCard(message.member, "player");
  newCard(message.member, "dealer");

  const row = getRow(
    (await getBalance(message.member)) >= bet && total(message.member, "player") < 21,
    total(message.member, "player") == 21,
  );

  const desc = await renderGambleScreen({ state: "playing", bet });

  const embed = new CustomEmbed(message.member, desc).setHeader(
    "blackjack",
    message.author.avatarURL(),
  );

  embed.addField(
    "dealer",
    total(message.member, "player") == 21
      ? `| ${games.get(message.member.id).dealerHand.join(" | ")} | **${total(message.member, "dealer")}**`
      : `| ${games.get(message.member.id).dealerHand[0]} |`,
  );
  embed.addField(
    message.member.user.username,
    `| ${games.get(message.member.id).playerHand.join(" | ")} | **${total(message.member, "player")}**`,
  );

  if (msg) {
    await msg.edit({ embeds: [embed], components: [row] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  playGame(message, send, msg, args).catch((e) => {
    logger.error(
      `error occurred playing blackjack - ${message.author.id} (${message.author.username})`,
    );
    logger.error("blackjack error", { err: e, game: games.get(message.author.id) });
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    return send({
      embeds: [new ErrorEmbed("an error occurred while running - join support server")],
    });
  });
}

function newCard(member: GuildMember, forHand: "player" | "dealer") {
  const deck = games.get(member.user.id).deck;

  const hand =
    forHand == "player"
      ? games.get(member.user.id).playerHand
      : games.get(member.user.id).dealerHand;

  hand.push(deck.shift());

  games.set(member.user.id, {
    id: games.get(member.user.id).id,
    bet: games.get(member.user.id).bet,
    deck,
    dealerHand: forHand == "dealer" ? hand : games.get(member.user.id).dealerHand,
    playerHand: forHand == "player" ? hand : games.get(member.user.id).playerHand,
    playerDone: games.get(member.user.id).playerDone,
  });
}

function total(member: GuildMember, forHand: "player" | "dealer") {
  let total = 0;
  let aces = 0;

  let aceAs11 = false;

  for (let card of forHand == "player"
    ? games.get(member.user.id).playerHand
    : games.get(member.user.id).dealerHand) {
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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  m: Message,
  args: string[],
) {
  if (!games.has(message.author.id)) return;

  const bet = games.get(message.author.id).bet;

  const edit = async (data: MessageEditOptions, interaction?: ButtonInteraction) => {
    if (!interaction || interaction.deferred || interaction.replied) return m.edit(data);
    return interaction.update(data).catch(() => m.edit(data));
  };

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    if (
      !(await isPremium(message.member)) ||
      !((await getTier(message.member)) >= 2) ||
      (await getBalance(message.member)) < bet
    ) {
      return edit({ embeds: [embed], components: [] }, interaction);
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
          content: `[${getTimestamp()}] ${message.member.user.username} (${message.author.id}) given captcha randomly in blackjack`,
        });
        hook.destroy();
      }
    }

    await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
    await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

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
    }
  };

  const checkWin = () => {
    if (total(message.member, "player") > 21) return "lose";
    if (total(message.member, "dealer") > 21) return "win";
    if (total(message.member, "player") > total(message.member, "dealer")) return "win";
    if (total(message.member, "player") < total(message.member, "dealer")) return "lose";
    if (total(message.member, "player") == total(message.member, "dealer")) return "draw";
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
        bet: games.get(message.member.id).bet,
        winnings,
        multiplier: multi,
        eventProgress,
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
      games.get(message.member.id).playerDone
        ? `| ${games.get(message.member.id).dealerHand.join(" | ")} | **${total(message.member, "dealer")}**`
        : `| ${games.get(message.member.id).dealerHand[0]} |`,
    );
    embed.addField(
      message.member.user.username,
      `| ${games.get(message.member.id).playerHand.join(" | ")} | **${total(message.member, "player")}**`,
    );

    return embed;
  };

  const handOutcome = () => {
    return JSON.stringify({
      dealer: {
        cards: games.get(message.member.id).dealerHand,
        total: total(message.member, "dealer"),
      },
      player: {
        cards: games.get(message.member.id).playerHand,
        total: total(message.member, "player"),
      },
    });
  };

  const lose = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      game: "blackjack",
      bet: bet,
      result: "lose",
      outcome: handOutcome(),
    });
    gamble(message.author, "blackjack", bet, "lose", id, 0);

    const embed = await render("lose");
    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const win = async (interaction?: ButtonInteraction) => {
    const eventProgress = await addEventProgress(
      message.client as NypsiClient,
      message.member,
      "blackjack",
      1,
    );

    let winnings = bet * 2;

    const multi = (await getGambleMulti(message.member, message.member.client as NypsiClient))
      .multi;

    if (
      games.get(message.member.id).playerHand.length === 2 &&
      total(message.member, "player") === 21
    ) {
      winnings = bet * 2.5;
      addProgress(message.member, "blackjack_pro", 1);
      addTaskProgress(message.member, "blackjack");
    }

    winnings = Math.floor(winnings + winnings * multi);

    const earnedXp = await calcEarnedGambleXp(
      message.member,
      message.client as NypsiClient,
      bet,
      games.get(message.member.id).playerHand.length === 2 && total(message.member, "player") === 21
        ? 2.5
        : 2,
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
      bet: bet,
      game: "blackjack",
      result: "win",
      outcome: handOutcome(),
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "blackjack", bet, "win", id, winnings);

    await addBalance(message.member, winnings);

    const embed = await render("win", winnings, multi, earnedXp, id, eventProgress);

    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const draw = async (interaction?: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet,
      game: "blackjack",
      result: "draw",
      outcome: handOutcome(),
      earned: bet,
    });
    gamble(message.author, "blackjack", bet, "draw", id, bet);
    await addBalance(message.member, bet);
    const embed = await render("draw", bet);

    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const checkContinue = () => {
    if (total(message.member, "player") < 21) return "continue";
    else if (total(message.member, "player") > 21) return "lose";
    else return "end";
  };

  const playerDone = async (interaction?: ButtonInteraction, skipFirstEdit = false) => {
    games.set(message.member.id, {
      id: games.get(message.member.id).id,
      bet: games.get(message.member.id).bet,
      deck: games.get(message.member.id).deck,
      dealerHand: games.get(message.member.id).dealerHand,
      playerHand: games.get(message.member.id).playerHand,
      playerDone: true,
    });

    if (!skipFirstEdit) {
      const embed = await render("playing");
      const row = getRow(false, true);

      await edit({ embeds: [embed], components: [row] }, interaction);
    }

    while (total(message.member, "dealer") < 17) {
      newCard(message.member, "dealer");
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

  if (total(message.member, "player") == 21) {
    return playerDone(undefined, true);
  }

  const listen = async () => {
    const filter = (i: Interaction) => i.user.id == message.author.id;

    let fail = false;

    const reaction = await m
      .awaitMessageComponent({ filter, time: 90000 })
      .then(async (collected) => {
        setTimeout(() => {
          collected.deferUpdate().catch(() => {});
        }, 1500);
        return collected as ButtonInteraction;
      })
      .catch((e) => {
        logger.warn("bj error", e);
        fail = true;
        games.delete(message.author.id);
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        message.channel.send({ content: message.author.toString() + " blackjack game expired" });
      });

    if (fail || !reaction) return;

    if (reaction.customId === "hit") {
      newCard(message.member, "player");

      const cont = checkContinue();
      if (cont === "lose") return lose(reaction);
      else if (cont === "end") await playerDone(reaction);
      else {
        const embed = await render("playing");
        const row = getRow(false, false);
        await edit({ embeds: [embed], components: [row] }, reaction);
        return listen();
      }
    } else if (reaction.customId === "stand") {
      await playerDone(reaction);
    } else if (reaction.customId === "dd") {
      const balance = await getBalance(message.member);

      if (balance >= bet && games.get(message.member.id).playerHand.length === 2) {
        await removeBalance(message.member, bet);

        games.set(message.member.id, {
          id: games.get(message.member.id).id,
          bet: games.get(message.member.id).bet * 2,
          deck: games.get(message.member.id).deck,
          dealerHand: games.get(message.member.id).dealerHand,
          playerHand: games.get(message.member.id).playerHand,
          playerDone: games.get(message.member.id).playerDone,
        });
      }

      newCard(message.member, "player");

      const cont = checkContinue();
      if (cont === "lose") return lose(reaction);
      else return playerDone(reaction);
    }
  };

  return listen();
}
