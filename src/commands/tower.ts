import { variants } from "@catppuccin/palette";
import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../init/redis";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { a } from "../utils/functions/anticheat";
import { isLockedOut, verifyUser } from "../utils/functions/captcha";
import { addProgress } from "../utils/functions/economy/achievements";
import { calcMaxBet, getBalance, getDefaultBet, getMulti, updateBalance } from "../utils/functions/economy/balance";
import { addToGuildXP, getGuildByUser } from "../utils/functions/economy/guilds";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { addGamble } from "../utils/functions/economy/stats";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils";
import { calcEarnedXp, getXp, updateXp } from "../utils/functions/economy/xp";
import { isPremium } from "../utils/functions/premium/premium";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { gamble, logger } from "../utils/logger";

const cmd = new Command("tower", "play dragon tower", Categories.MONEY).setAliases([
  "dragon",
  "dragontower",
  "dt",
  "dragonstower",
]);

interface Game {
  userId: string;
  bet: number;
  win: number;
  board: string[][];
  increment: number;
  embed: CustomEmbed;
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

const difficultyIncrements = new Map<string, number>([
  ["easy", 0.5],
  ["medium", 0.9],
  ["hard", 2.1],
]);
const games = new Map<string, Game>();
const GEM_EMOJI = "<:nypsi_gem_green:1046866209326514206>";

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) => option.setName("bet").setDescription("how much would you like to bet").setRequired(false))
  .addStringOption((option) =>
    option
      .setName("difficulty")
      .setDescription("how hard would you like your game to be")
      .setChoices(
        ...Array.from(difficultyIncrements.keys()).map((i) => {
          return { name: i, value: i };
        })
      )
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

  if (games.has(message.author.id)) return send({ embeds: [new ErrorEmbed("you are already playing dragon tower")] });

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

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(message.member)
          .addField("usage", "/tower <bet> (difficulty)")
          .addField("game", "click the eggs to climb to the top of the dragons tower")
          .setHeader("dragon tower help", message.author.avatarURL()),
      ],
    });
  }

  if (games.has(message.author.id)) return send({ embeds: [new ErrorEmbed("you are already playing dragon tower")] });

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you are already playing something")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you are already playing something")] });
  }
  const maxBet = await calcMaxBet(message.member);
  const defaultBet = await getDefaultBet(message.member);

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

  let chosenDifficulty = args[1]?.toLowerCase();

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    chosenDifficulty = message.options.getString("difficulty");
  }

  if (!chosenDifficulty) {
    chosenDifficulty = "medium";
  } else if (!difficultyIncrements.has(chosenDifficulty)) {
    if (msg) {
      return msg.edit({
        embeds: [new ErrorEmbed(`invalid difficulty\nallowed: ${Array.from(difficultyIncrements.keys()).join(", ")}`)],
      });
    } else {
      return send({
        embeds: [new ErrorEmbed(`invalid difficulty\nallowed: ${Array.from(difficultyIncrements.keys()).join(", ")}`)],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 25);

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).userId == message.author.id) {
        games.delete(message.author.id);
        await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
      }
    }
  }, 180000);
  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  await updateBalance(message.member, (await getBalance(message.member)) - bet);

  const board = createBoard(chosenDifficulty);

  const components = createRows(board, false);

  const embed = new CustomEmbed(message.member, `**bet** $${bet.toLocaleString()}\n**0**x ($0)`)
    .setHeader("dragon tower", message.author.avatarURL())
    .setFooter({ text: `difficulty: ${chosenDifficulty}` });

  games.set(message.author.id, {
    bet,
    board,
    increment: difficultyIncrements.get(chosenDifficulty),
    userId: message.author.id,
    win: 0,
    embed,
  });

  if (msg) {
    await msg.edit({ embeds: [embed], components });
  } else {
    msg = await send({ embeds: [embed], components });
  }

  playGame(message, msg, args).catch((e: string) => {
    logger.error(`error occured playing tower - ${message.author.tag} (${message.author.id})`);
    logger.error(e);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    return send({
      embeds: [new ErrorEmbed("an error occured while running - join support server")],
    });
  });
}

function createBoard(diff: string) {
  const board: string[][] = [];
  let spawnedGem = false;

  const createRow = () => {
    const populate = (eggs: number, row: string[]) => {
      while (row.filter((i) => ["b", "g"].includes(i)).length < eggs) {
        const gemSpawnChance = Math.floor(Math.random() * 45);

        if (gemSpawnChance == 7 && !spawnedGem) {
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
        row = populate(2, new Array(3).fill("a"));
        break;
      case "medium":
        row = populate(2, new Array(4).fill("a"));
        break;
      case "hard":
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
            delete button.data.label;
          }
          break;
        case "g":
          if (end || i != getActiveRow(board)) button.setDisabled(true);
          if (end) {
            button.setEmoji(GEM_EMOJI);
            delete button.data.label;
          }
          break;
        case "c":
          button.setStyle(ButtonStyle.Success);
          button.setDisabled(true);
          button.setEmoji("🥚");
          delete button.data.label;
          break;
        case "gc":
          button.setStyle(ButtonStyle.Success);
          button.setDisabled(true);
          button.setEmoji(GEM_EMOJI);
          delete button.data.label;
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
    new ButtonBuilder().setCustomId("finish").setLabel("finish").setStyle(ButtonStyle.Success).setDisabled(end)
  );

  return rows;
}

async function playGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  msg: Message,
  args: string[]
): Promise<void> {
  const game = games.get(message.author.id);

  const replay = async (embed: CustomEmbed) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    if (!(await isPremium(message.member)) || (await getBalance(message.member)) < game.bet) {
      return msg.edit({ embeds: [embed], components: createRows(game.board, true) });
    }

    const components = createRows(game.board, true);

    (components[components.length - 1].components[0] as ButtonBuilder)
      .setCustomId("rp")
      .setLabel("play again")
      .setDisabled(false);

    await msg.edit({ embeds: [embed], components });

    const res = await msg
      .awaitMessageComponent({ filter: (i: Interaction) => i.user.id == message.author.id, time: 30000 })
      .catch(() => {
        (
          components[components.length - 1].components[
            components[components.length - 1].components.length - 1
          ] as ButtonBuilder
        )
          .setCustomId("rp")
          .setLabel("play again")
          .setDisabled(true);
        msg.edit({ components });
        return;
      });

    if (res && res.customId == "rp") {
      await res.deferUpdate();
      logger.log({
        level: "cmd",
        message: `${message.guild.id} - ${message.author.tag}: replaying tower`,
      });
      if (isLockedOut(message.author.id)) return verifyUser(message);

      addHourlyCommand(message.member);

      await redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS, "tower", 1);
      await a(message.author.id, message.author.tag, message.content);

      if ((await redis.get(Constants.redis.nypsi.RESTART)) == "t") {
        if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
          message.react("💀");
        } else {
          return msg.edit({ embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")] });
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
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress"
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        }
      }

      return prepareGame(message, args, msg);
    }
  };

  const lose = async () => {
    gamble(message.author, "tower", game.bet, false, 0);
    await addGamble(message.member, "tower", false);
    game.embed.setColor(Constants.EMBED_FAIL_COLOR);
    game.embed.setDescription(
      "**bet** $" +
        game.bet.toLocaleString() +
        "\n**" +
        game.win.toFixed(2) +
        "**x ($" +
        Math.round(game.bet * game.win).toLocaleString() +
        ")\n\n**you lose!!**"
    );

    replay(game.embed);
    return games.delete(message.author.id);
  };

  const win1 = async () => {
    let winnings = Math.round(game.bet * game.win);
    const multi = await getMulti(game.userId);

    if (multi > 0) {
      winnings += Math.round(winnings * multi);
    }

    game.embed.setDescription(
      `**bet** $${game.bet.toLocaleString()}\n` +
        `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})\n\n**winner!!**\n` +
        `**you win** $${winnings.toLocaleString()}${multi > 0 ? `\n**${Math.floor(multi * 100)}**% bonus` : ""}`
    );
    game.embed.setColor(Constants.EMBED_SUCCESS_COLOR);

    const earnedXp = await calcEarnedXp(message.member, game.bet);

    if (earnedXp > 0) {
      await updateXp(message.member, (await getXp(message.member)) + earnedXp);
      game.embed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildByUser(message.member);

      if (guild) {
        await addToGuildXP(guild.guildName, earnedXp, message.member);
      }
    }

    gamble(message.author, "tower", game.bet, true, winnings);
    await addGamble(message.member, "tower", true);

    await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    games.delete(message.author.id);
    return replay(game.embed);
  };

  const draw = async () => {
    gamble(message.author, "tower", game.bet, true, game.bet);
    await addGamble(message.member, "tower", true);
    game.embed.setColor(variants.macchiato.yellow.hex as ColorResolvable);
    game.embed.setDescription(
      "**bet** $" +
        game.bet.toLocaleString() +
        "\n**" +
        game.win.toFixed(2) +
        "**x ($" +
        Math.round(game.bet * game.win).toLocaleString() +
        ")" +
        "\n\n**draw!!**\nyou win $" +
        game.bet.toLocaleString()
    );
    await updateBalance(message.member, (await getBalance(message.member)) + game.bet);
    games.delete(message.author.id);
    return replay(game.embed);
  };

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await msg
    .awaitMessageComponent({ filter, time: 60000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected;
    })
    .catch(() => {
      fail = true;
      games.delete(message.author.id);
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: message.author.toString() + " tower game expired" });
    });

  if (fail) return;

  if (!response) return;

  if (response.customId.length != 2 && response.customId != "finish") {
    await message.channel.send({ content: message.author.toString() + " invalid coordinate, example: `a3`" });
    return playGame(message, msg, args);
  }

  if (response.customId == "finish") {
    if (game.win < 1) {
      lose();
      return;
    } else if (game.win == 1) {
      draw();
      return;
    } else {
      win1();
      return;
    }
  }
  const [y, x] = response.customId.split("").map((i) => parseInt(i));

  const row = game.board[y];

  switch (row[x]) {
    case "a":
      row[x] = "x";
      lose();
      return;
    case "g":
    case "b":
      if (row[x] == "b") {
        row[x] = "c";
      } else {
        row[x] = "gc";
        game.win += 3;

        const caught = Math.floor(Math.random() * 50);

        if (caught == 7) {
          addInventoryItem(message.member, "green_gem", 1);
          addProgress(message.author.id, "gem_hunter", 1);
          response.followUp({
            embeds: [
              new CustomEmbed(
                message.member,
                `${GEM_EMOJI} you found a **gem**!!\nit has been added to your inventory, i wonder what powers it has`
              ),
            ],
            ephemeral: true,
          });
        } else {
          response.followUp({
            embeds: [
              new CustomEmbed(
                message.member,
                `${GEM_EMOJI} you found a **gem**!!\nunfortunately you dropped it and it shattered. maybe next time`
              ),
            ],
            ephemeral: true,
          });
        }
      }

      const modifiers = new Map<number, number>([
        [0, 0.6],
        [1, 0.55],
        [2, 0.5],
        [3, 0.4],
        [4, 0.4],
        [5, 0.3],
        [6, 0.2],
        [7, 0.1],
        [8, 0.1],
      ]);

      game.win += game.increment * (y + 1) * modifiers.get(y);

      // games.set(message.author.id, {
      //   bet: bet,
      //   win: win,
      //   grid: grid,
      //   id: games.get(message.author.id).id,
      //   voted: games.get(message.author.id).voted,
      //   increment,
      // });

      game.embed.setDescription(
        "**bet** $" +
          game.bet.toLocaleString() +
          "\n**" +
          game.win.toFixed(2) +
          "**x ($" +
          Math.round(game.bet * game.win).toLocaleString() +
          ")"
      );

      if (y >= 8) {
        await addProgress(message.author.id, "tower_pro", 1);
        game.win += game.increment * 2;
        win1();
        return;
      }

      msg.edit({ embeds: [game.embed], components: createRows(game.board, false) });

      return playGame(message, msg, args);
  }
}
