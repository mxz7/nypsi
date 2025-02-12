import { flavors } from "@catppuccin/palette";
import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonComponentData,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  WebhookClient,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
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
} from "../utils/functions/economy/balance";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { createGame } from "../utils/functions/economy/stats";
import {
  createUser,
  formatBet,
  renderGambleScreen,
  userExists,
} from "../utils/functions/economy/utils";
import { addXp, calcEarnedGambleXp } from "../utils/functions/economy/xp";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { percentChance } from "../utils/functions/random";
import { recentCommands } from "../utils/functions/users/commands";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { gamble, getTimestamp, logger } from "../utils/logger";
import _ = require("lodash");
import ms = require("ms");

const cmd = new Command("tower", "play dragon tower", "money").setAliases([
  "dragon",
  "dragontower",
  "dt",
  "dragonstower",
]);

interface Game {
  gameId: number;
  userId: string;
  bet: number;
  win: number;
  board: string[][];
  payout: number[];
  embed: CustomEmbed;
  difficulty: string;
}

/**
 * nothing = a
 * egg = b
 * gem = g
 * found egg = c
 * found gem = gc
 * bad click = x (end game)
 * last row is always finish / play again
 * only show 1 untouched row
 * auto finish on 15x or higher or last row
 *
 */

const payoutsData = new Map<string, number[]>([
  ["easy", [0.3, 0.7, 1.25, 1.9, 2.7, 3.6, 4.6, 4.7, 6]],
  ["medium", [0.95, 1.7, 2.5, 3.4, 4.5, 5.9, 6, 7.9, 10]],
  ["hard", [1, 2, 3.1, 4.3, 5.6, 6.9, 8.6, 10, 15]],
  ["expert", [2, 3.8, 6.1, 8.4, 10.6, 14, 17, 25, 50]],
]);

// is the difference
const payouts = new Map<string, number[]>();

for (const [difficulty, values] of payoutsData.entries()) {
  const increments: number[] = [];

  for (const value of values) {
    if (values.indexOf(value) === 0) increments.push(value);
    else increments.push(parseFloat((value - values[values.indexOf(value) - 1]).toFixed(2)));
  }

  payouts.set(difficulty, increments);
}

// console.log(payouts);

const games = new Map<string, Game>();
const GEM_EMOJI = "<:nypsi_gem:1046854542047850556>";

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("difficulty")
      .setDescription("how hard would you like your game to be")
      .setChoices(
        ...Array.from(payouts.keys()).map((i) => {
          return { name: i, value: i };
        }),
      ),
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (games.has(message.author.id))
    return send({ embeds: [new ErrorEmbed("you are already playing dragon tower")] });

  return prepareGame(message, args);
}

cmd.setRun(run);

module.exports = cmd;

async function prepareGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
  msg?: Message,
) {
  recentCommands.set(message.author.id, Date.now());

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

  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    return send({
      embeds: [
        new CustomEmbed(message.member)
          .addField("usage", "/tower <bet> (difficulty)")
          .addField("game", "click the eggs to climb to the top of the dragons tower")
          .setHeader("dragon tower help", message.author.avatarURL()),
      ],
    });
  }

  if (games.has(message.author.id))
    return send({ embeds: [new ErrorEmbed("you are already playing dragon tower")] });

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }
  const maxBet = await calcMaxBet(message.member);

  let bet = (await formatBet(args[0] || "", message.member).catch(() => {})) || defaultBet;

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    bet = (await formatBet(message.options.getString("bet") || "", message.member)) || defaultBet;
  }

  if (!bet) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("invalid bet")] });
    } else {
      return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }
  }

  if (bet <= 0) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("/tower <bet> (difficulty)")] });
    } else {
      return send({ embeds: [new ErrorEmbed("/tower <bet> (difficulty)")] });
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

  let chosenDifficulty = args[1]?.toLowerCase();

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    chosenDifficulty = message.options.getString("difficulty");
  }

  if (!chosenDifficulty) {
    chosenDifficulty = "medium";
  } else if (!payouts.has(chosenDifficulty)) {
    if (msg) {
      return msg.edit({
        embeds: [
          new ErrorEmbed(`invalid difficulty\nallowed: ${Array.from(payouts.keys()).join(", ")}`),
        ],
      });
    } else {
      return send({
        embeds: [
          new ErrorEmbed(`invalid difficulty\nallowed: ${Array.from(payouts.keys()).join(", ")}`),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 10);

  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  await removeBalance(message.member, bet);

  const board = createBoard(chosenDifficulty);

  const components = createRows(board, false);

  components[components.length - 1].components[0].setDisabled(true);

  const desc = await renderGambleScreen(message.author.id, "playing", bet, "**0**x ($0)");

  const embed = new CustomEmbed(message.member, desc)
    .setHeader("dragon tower", message.author.avatarURL())
    .setFooter({ text: `difficulty: ${chosenDifficulty}` });

  const gameId = Math.random();

  games.set(message.author.id, {
    gameId,
    bet,
    board,
    payout: payouts.get(chosenDifficulty),
    userId: message.author.id,
    win: 0,
    embed,
    difficulty: chosenDifficulty,
  });

  setTimeout(() => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).gameId == gameId) {
        const game = games.get(message.author.id);
        games.delete(message.author.id);
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        logger.warn("tower still in playing state after 5 minutes - deleting key", game);
      }
    }
  }, ms("5 minutes"));

  if (msg) {
    await msg.edit({ embeds: [embed], components });
  } else {
    msg = await send({ embeds: [embed], components });
  }

  playGame(message, msg, args).catch((e) => {
    logger.error(
      `error occurred playing tower - ${message.author.id} (${message.author.username})`,
    );
    logger.error("tower error", e);
    console.trace();
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    return send({
      embeds: [new ErrorEmbed("an error occurred while running - join support server")],
    });
  });
}

function createBoard(diff: string) {
  const board: string[][] = [];
  let spawnedGem = false;

  const createRow = () => {
    const populate = (eggs: number, row: string[]) => {
      while (row.filter((i) => ["b", "g"].includes(i)).length < eggs) {
        if (percentChance(1.5) && !spawnedGem) {
          const pos = randomInt(0, row.length);
          row[pos] = "g";
          spawnedGem = true;
        } else {
          const pos = randomInt(0, row.length);
          if (row[pos] == "g") continue;
          row[pos] = "b";
        }
      }
      return row;
    };
    let row: string[];

    switch (diff) {
      case "easy":
        row = populate(3, new Array(4).fill("a"));
        break;
      case "medium":
        row = populate(2, new Array(3).fill("a"));
        break;
      case "hard":
        row = populate(1, new Array(2).fill("a"));
        break;
      case "expert":
        row = populate(1, new Array(4).fill("a"));
        break;
    }
    board.push(row);
  };

  for (let i = 0; i < 9; i++) {
    createRow();
  }

  return board;
}

function getActiveRow(board: string[][]) {
  let index = 0;
  for (const row of board) {
    if (row.includes("c") || row.includes("gc")) index++;
  }
  return index > 8 ? 8 : index;
}

function createRows(board: string[][], end = false) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (let i = getActiveRow(board); i >= 0; i--) {
    if (rows.length >= 4) break;

    const rowData = board[i];
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    for (const item of rowData) {
      const button = new ButtonBuilder();

      button.setCustomId(`${i}${row.components.length}`);
      button.setLabel("\u200B");
      button.setStyle(ButtonStyle.Secondary);

      switch (item) {
        case "a":
          if (end || i != getActiveRow(board)) button.setDisabled(true);
          break;
        case "b":
          if (end || i != getActiveRow(board)) button.setDisabled(true);
          if (end) {
            button.setEmoji("🥚");
            delete (button.data as ButtonComponentData).label;
          }
          break;
        case "g":
          if (end || i != getActiveRow(board)) button.setDisabled(true);
          if (end) {
            button.setEmoji(GEM_EMOJI);
            delete (button.data as ButtonComponentData).label;
          }
          break;
        case "c":
          button.setStyle(ButtonStyle.Success);
          button.setDisabled(true);
          button.setEmoji("🥚");
          delete (button.data as ButtonComponentData).label;
          break;
        case "gc":
          button.setStyle(ButtonStyle.Success);
          button.setDisabled(true);
          button.setEmoji(GEM_EMOJI);
          delete (button.data as ButtonComponentData).label;
          break;
        case "x":
          button.setStyle(ButtonStyle.Danger);
          button.setDisabled(true);
          break;
      }
      row.addComponents(button);
    }
    rows.push(row);
  }

  rows[rows.length] = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("finish")
      .setLabel("finish")
      .setStyle(ButtonStyle.Success)
      .setDisabled(end),
    new ButtonBuilder()
      .setCustomId("random")
      .setLabel("random")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(end),
  );

  return rows;
}

async function playGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  msg: Message,
  args: string[],
): Promise<void> {
  const game = games.get(message.author.id);
  const board = game.board;

  const edit = async (data: MessageEditOptions, interaction: ButtonInteraction) => {
    if (!interaction || interaction.deferred || interaction.replied) return msg.edit(data);
    return interaction.update(data).catch(() => msg.edit(data));
  };

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction, update = true) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    const components = createRows(board, true);

    if (update) {
      if (
        !(await isPremium(message.member)) ||
        !((await getTier(message.member)) >= 2) ||
        (await getBalance(message.member)) < game.bet
      ) {
        return edit({ embeds: [embed], components: createRows(board, true) }, interaction);
      }

      if (
        percentChance(0.1) &&
        parseInt(await redis.get(`anticheat:interactivegame:count:${message.author.id}`)) > 100
      ) {
        const res = await giveCaptcha(message.author.id);

        if (res) {
          logger.info(
            `${this.member.user.username} (${message.author.id}) given captcha randomly in tower`,
          );
          const hook = new WebhookClient({
            url: process.env.ANTICHEAT_HOOK,
          });
          await hook.send({
            content: `[${getTimestamp()}] ${this.member.user.username} (${message.author.id}) given captcha randomly in tower`,
          });
          hook.destroy();
        }
      }

      await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
      await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

      (components[components.length - 1].components[0] as ButtonBuilder)
        .setCustomId("rp")
        .setLabel("play again")
        .setDisabled(false);

      await edit({ embeds: [embed], components }, interaction);
    }

    const res = await msg
      .awaitMessageComponent({
        filter: (i: Interaction) => i.user.id == message.author.id,
        time: 30000,
      })
      .catch(() => {
        (components[components.length - 1].components[0] as ButtonBuilder)
          .setCustomId("rp")
          .setLabel("play again")
          .setDisabled(true);
        msg.edit({ components });
        return;
      });

    if (res && res.customId == "rp") {
      await res.deferUpdate();
      logger.info(
        `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying tower`,
      );
      if (await isLockedOut(message.author.id)) {
        await verifyUser(message);
        return replay(embed, interaction, false);
      }

      addHourlyCommand(message.member);

      await a(message.author.id, message.author.username, message.content, "tower");

      if (
        (await redis.get(
          `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
        )) == "t"
      ) {
        if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
          message.react("💀");
        } else {
          return msg.edit({
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
          return msg.edit({
            embeds: [
              new CustomEmbed(
                message.member,
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        }
      }

      return prepareGame(message, args, msg);
    }
  };

  const lose = async (interaction: ButtonInteraction) => {
    const board = _.cloneDeep(game.board);

    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "tower",
      result: "lose",
      outcome:
        `difficulty: ${game.difficulty}\n` +
        "A = blank | B = egg | C = clicked egg | G = gem | GC = found gem | X = bad click\n" +
        board
          .map((row) => row.join("").toUpperCase())
          .reverse()
          .join("\n"),
    });
    gamble(message.author, "tower", game.bet, "lose", id, 0);
    game.embed.setFooter({ text: `id: ${id}` });
    game.embed.setColor(Constants.EMBED_FAIL_COLOR);
    const desc = await renderGambleScreen(
      message.author.id,
      "lose",
      game.bet,
      `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
    );
    game.embed.setDescription(desc);

    replay(game.embed, interaction);
    return games.delete(message.author.id);
  };

  const win1 = async (interaction: ButtonInteraction) => {
    let winnings = Math.round(game.bet * game.win);
    const multi = (await getGambleMulti(game.userId)).multi;

    if (multi > 0) {
      winnings += Math.round(winnings * multi);
    }

    const desc = await renderGambleScreen(
      message.author.id,
      "win",
      game.bet,
      `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
      winnings,
      multi,
    );
    game.embed.setDescription(desc);

    game.embed.setColor(Constants.EMBED_SUCCESS_COLOR);

    const earnedXp = await calcEarnedGambleXp(message.member, game.bet, game.win);

    if (earnedXp > 0) {
      await addXp(message.member, earnedXp);
      game.embed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildName(message.member);

      if (guild) {
        await addToGuildXP(guild, earnedXp, message.member);
      }
    }

    const board = _.cloneDeep(game.board);

    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "tower",
      result: "win",
      outcome:
        `difficulty: ${game.difficulty}\n` +
        "A = blank | B = egg | C = clicked egg | G = gem | GC = found gem | X = bad click\n" +
        board
          .map((row) => row.join("").toUpperCase())
          .reverse()
          .join("\n"),
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "tower", game.bet, "win", id, winnings);

    if (earnedXp > 0) {
      game.embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      game.embed.setFooter({ text: `id: ${id}` });
    }

    await addBalance(message.member, winnings);
    games.delete(message.author.id);
    return replay(game.embed, interaction);
  };

  const draw = async (interaction: ButtonInteraction) => {
    const board = _.cloneDeep(game.board);

    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "tower",
      result: "draw",
      outcome:
        `difficulty: ${game.difficulty}\n` +
        "A = blank | B = egg | C = clicked egg | G = gem | GC = found gem | X = bad click\n" +
        board
          .map((row) => row.join("").toUpperCase())
          .reverse()
          .join("\n"),
      earned: game.bet,
    });
    gamble(message.author, "tower", game.bet, "draw", id, game.bet);
    game.embed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);
    const desc = await renderGambleScreen(
      message.author.id,
      "draw",
      game.bet,
      `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
    );
    game.embed.setDescription(desc);
    await addBalance(message.member, game.bet);
    games.delete(message.author.id);
    return replay(game.embed, interaction);
  };

  const clickSquare = async (response: ButtonInteraction, x: number, y: number) => {
    const row = board[y];

    for (const item of row) {
      if (["c", "gc"].includes(item)) {
        if (response.deferred || response.replied)
          await response.followUp({ embeds: [new ErrorEmbed("invalid square")], ephemeral: true });
        else await response.reply({ embeds: [new ErrorEmbed("invalid square")], ephemeral: true });
        return playGame(message, msg, args);
      }
    }

    switch (row[x]) {
      case "a":
        row[x] = "x";
        lose(response);
        return;
      case "g":
      case "b":
        if (row[x] == "b") {
          row[x] = "c";
        } else {
          row[x] = "gc";
          game.win += 3;

          if (percentChance(0.5) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
            await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t");
            await redis.expire(Constants.redis.nypsi.GEM_GIVEN, Math.floor(ms("1 days") / 1000));
            addInventoryItem(message.member, "green_gem", 1);
            addProgress(message.author.id, "gem_hunter", 1);
            if (response.replied || response.deferred)
              response.followUp({
                embeds: [
                  new CustomEmbed(
                    message.member,
                    `${GEM_EMOJI} you found a **gem**!!\nit has been added to your inventory, i wonder what powers it has`,
                  ),
                ],
                ephemeral: true,
              });
            else
              response.reply({
                embeds: [
                  new CustomEmbed(
                    message.member,
                    `${GEM_EMOJI} you found a **gem**!!\nit has been added to your inventory, i wonder what powers it has`,
                  ),
                ],
                ephemeral: true,
              });
          }
        }

        game.win += game.payout[y];

        // games.set(message.author.id, {
        //   bet: bet,
        //   win: win,
        //   grid: grid,
        //   id: games.get(message.author.id).id,
        //   voted: games.get(message.author.id).voted,
        //   increment,
        // });

        const desc = await renderGambleScreen(
          message.author.id,
          "playing",
          game.bet,
          `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
        );
        game.embed.setDescription(desc);

        if (y >= 8) {
          addProgress(message.author.id, "tower_pro", 1);
          win1(response);
          return;
        }

        const components = createRows(board, false);

        if (game.win < 1) {
          components[components.length - 1].components[0].setDisabled(true);
        }

        edit({ embeds: [game.embed], components }, response);

        return playGame(message, msg, args);
    }
  };

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await msg
    .awaitMessageComponent({ filter, time: 90000 })
    .then(async (collected) => {
      setTimeout(() => {
        collected.deferUpdate().catch(() => {});
      }, 1500);
      return collected as ButtonInteraction;
    })
    .catch((e) => {
      logger.warn("tower error", e);
      fail = true;
      games.delete(message.author.id);
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: message.author.toString() + " tower game expired" });
    });

  if (fail) return;

  if (!response) return;

  if (!response.isButton()) return;

  if (response.customId == "random") {
    const y = getActiveRow(board);

    const rows = createRows(board, false);

    const x = randomInt(rows[0].components.length);

    return clickSquare(response, x, y);
  }

  if (response.customId == "finish") {
    if (game.win < 1) {
      lose(response);
      return;
    } else if (game.win == 1) {
      draw(response);
      return;
    } else {
      win1(response);
      return;
    }
  }
  const [y, x] = response.customId.split("").map((i) => parseInt(i));

  return clickSquare(response, x, y);
}
