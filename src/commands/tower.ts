import { randomInt } from "crypto";
import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { calcMaxBet, getBalance, getDefaultBet, updateBalance } from "../utils/functions/economy/balance";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("tower", "play dragon tower", Categories.MONEY).setAliases(["dragon", "dragontower", "dt"]);

interface Game {
  userId: string;
  message: Message;
  gameMessage: Message;
  bet: number;
  win: number;
  difficiculty: string;
  board: string[][];
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
  ["medium", 1],
  ["hard", 2],
]);
const games = new Map<string, Game>();

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

  if (games.has(message.author.id)) return send({ embeds: [new ErrorEmbed("you are already playing dragon tower")] });

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
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
      }
    }
  }, 180000);

  const board = createBoard(chosenDifficulty);

  console.log(board);
}

function createBoard(diff: string) {
  const board: string[][] = [];
  let spawnedGem = false;

  const createRow = () => {
    const populate = (eggs: number, row: string[]) => {
      while (row.filter((i) => i == "b").length < eggs) {
        const gemSpawnChance = Math.floor(Math.random() * 10);

        if (gemSpawnChance == 3 && diff == "hard" && !spawnedGem) {
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
