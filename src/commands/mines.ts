import { variants } from "@catppuccin/palette";
import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import redis from "../init/redis.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { a } from "../utils/functions/anticheat.js";
import { isLockedOut, verifyUser } from "../utils/functions/captcha.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { calcMaxBet, getBalance, getDefaultBet, getMulti, updateBalance } from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildByUser } from "../utils/functions/economy/guilds.js";
import { addInventoryItem } from "../utils/functions/economy/inventory.js";
import { createGame } from "../utils/functions/economy/stats.js";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { calcEarnedXp, getXp, updateXp } from "../utils/functions/economy/xp.js";
import { isPremium } from "../utils/functions/premium/premium.js";
import { addHourlyCommand } from "../utils/handlers/commandhandler.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, logger } from "../utils/logger.js";

const games = new Map<
  string,
  {
    bet: number;
    win: number;
    grid: string[];
    id: number;
    voted: number;
    increment: number;
  }
>();

const GEM_EMOJI = "<:nypsi_gem_green:1046866209326514206>";
const abcde = new Map<string, number>();
const possibleLetters = ["a", "b", "c", "d", "e"];
const possibleNumbers = ["1", "2", "3", "4", "5"];
const mineIncrements = new Map<number, number>([
  [2, 0.2],
  [3, 0.25],
  [4, 0.3],
  [5, 0.4],
  [6, 0.5],
  [7, 0.6],
  [10, 1],
  [15, 1.5],
  [20, 5],
  [23, 15],
]);

abcde.set("a", 0);
abcde.set("b", 1);
abcde.set("c", 2);
abcde.set("d", 3);
abcde.set("e", 4);

const cmd = new Command("mines", "play mines", Categories.MONEY).setAliases(["minesweeper", "ms"]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) => option.setName("bet").setDescription("how much would you like to bet").setRequired(false))
  .addIntegerOption((option) =>
    option
      .setName("mine-count")
      .setDescription("how many mines do you want in your game")
      .setChoices(
        ...(Array.from(mineIncrements.keys()).map((n) => {
          return { name: n.toString(), value: n };
        }) as APIApplicationCommandOptionChoice<number>[])
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

  if (games.has(message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you are already playing mines")] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("mines help")
      .addField("usage", "/mines <bet> (mines)")
      .addField(
        "game rules",
        "a 5x5 grid of white squares will be created\n" +
          "once youve chosen your square, it will become green if there was no mine, if there was, you will lose your bet\n" +
          "if you don't choose an amount of mines, you will be given 3-6 mines, giving you 0.5x per square"
      );

    return send({ embeds: [embed] });
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

  if (games.has(message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you are already playing mines")] });
    } else {
      return send({ embeds: [new ErrorEmbed("you are already playing mines")] });
    }
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
      return msg.edit({ embeds: [new ErrorEmbed("/mines <bet> (mines)")] });
    } else {
      return send({ embeds: [new ErrorEmbed("/mines <bet> (mines)")] });
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

  let chosenMinesCount = parseInt(args[1]);

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    chosenMinesCount = message.options.getInteger("mine-count");
  }

  if (!chosenMinesCount) {
    chosenMinesCount = 0;
  } else if (!mineIncrements.has(chosenMinesCount)) {
    if (msg) {
      return msg.edit({
        embeds: [
          new ErrorEmbed(`you cannot use this amount of mines\nallowed: ${Array.from(mineIncrements.keys()).join(", ")}`),
        ],
      });
    } else {
      return send({
        embeds: [
          new ErrorEmbed(`you cannot use this amount of mines\nallowed: ${Array.from(mineIncrements.keys()).join(", ")}`),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 25);

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        games.delete(message.author.id);
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
      }
    }
  }, 180000);

  await updateBalance(message.member, (await getBalance(message.member)) - bet);

  const id = Math.random();

  const grid = [
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
    "a",
  ];

  let bombCount: number;
  let incrementAmount = 0.5;

  if (chosenMinesCount == 0) {
    bombCount = Math.floor(Math.random() * 4) + 3;
  } else {
    bombCount = chosenMinesCount;
    incrementAmount = mineIncrements.get(bombCount);
  }

  for (let i = 0; i < bombCount; i++) {
    const num = randomInt(24);

    if (grid[num] != "b") {
      grid[num] = "b";
    } else {
      i--;
    }
  }

  const spawnGem = randomInt(10);

  if (spawnGem < 3) {
    let passes = 0;
    let achieved = false;

    while (passes < 25 && !achieved) {
      const index = randomInt(grid.length - 1);

      if (grid[index] != "b") {
        grid[index] = "g";
        achieved = true;
        break;
      }
      passes++;
    }

    if (!achieved) {
      grid[grid.findIndex((i) => i == "a")] = "g";
    }
  }

  const multi = await getMulti(message.member);

  games.set(message.author.id, {
    bet: bet,
    win: 0,
    grid: grid,
    id: id,
    voted: multi,
    increment: incrementAmount,
  });

  const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)").setHeader(
    "mines",
    message.author.avatarURL()
  );

  const rows = getRows(grid, false);

  if (msg) {
    await msg.edit({ embeds: [embed], components: rows });
  } else {
    msg = await send({ embeds: [embed], components: rows });
  }

  playGame(message, msg, args).catch((e: string) => {
    logger.error(`error occured playing mines - ${message.author.tag} (${message.author.id})`);
    console.error(e);
    return send({
      embeds: [new ErrorEmbed("an error occured while running - join support server")],
    });
  });
}

function getRows(grid: string[], end: boolean) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const item of grid) {
    let current = rows[rows.length - 1];

    if (!current || current.components.length >= 5) {
      current = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      rows.push(current);
    }

    const coordinate = `${possibleLetters[current.components.length]}${rows.indexOf(current) + 1}`;

    if (coordinate === "e5") break;

    const button = new ButtonBuilder().setCustomId(coordinate).setLabel("\u200b");

    switch (item) {
      case "a":
        button.setStyle(ButtonStyle.Secondary);
        if (end) button.setDisabled(true);
        break;
      case "b":
        button.setStyle(ButtonStyle.Secondary);
        if (end) button.setStyle(ButtonStyle.Danger).setDisabled(true);
        break;
      case "c":
        button.setStyle(ButtonStyle.Success).setDisabled(true);
        break;
      case "g":
        button.setStyle(ButtonStyle.Secondary);
        if (end) button.setEmoji(GEM_EMOJI).setDisabled(true);
        break;
      case "gc":
        button.setStyle(ButtonStyle.Success).setDisabled(true);
        button.setEmoji(GEM_EMOJI);
        break;
      case "x":
        button.setStyle(ButtonStyle.Danger).setDisabled(true);
        break;
    }

    current.addComponents(button);
  }

  const button = new ButtonBuilder().setCustomId("finish").setLabel("finish").setStyle(ButtonStyle.Success);

  if (end) button.setDisabled(true);

  rows[4].addComponents(button);

  return rows;
}

function toLocation(coordinate: string) {
  const letter = coordinate.split("")[0];
  const number = coordinate.split("")[1];

  switch (number) {
    case "1":
      return abcde.get(letter);
    case "2":
      return abcde.get(letter) + 5;
    case "3":
      return abcde.get(letter) + 10;
    case "4":
      return abcde.get(letter) + 15;
    case "5":
      return abcde.get(letter) + 20;
  }
}

async function playGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  msg: Message,
  args: string[]
): Promise<void> {
  if (!games.has(message.author.id)) return;

  const bet = games.get(message.author.id).bet;
  let win = games.get(message.author.id).win;
  const grid = games.get(message.author.id).grid;
  const increment = games.get(message.author.id).increment;

  const embed = new CustomEmbed(message.member).setHeader("mines", message.author.avatarURL());

  const edit = async (data: MessageEditOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  const replay = async (embed: CustomEmbed) => {
    if (!(await isPremium(message.member)) || (await getBalance(message.member)) < bet) {
      return msg.edit({ embeds: [embed], components: getRows(grid, true) });
    }

    const components = getRows(grid, true);

    (components[components.length - 1].components[components[components.length - 1].components.length - 1] as ButtonBuilder)
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
        message: `${message.guild.id} - ${message.author.tag}: replaying mines`,
      });
      if (isLockedOut(message.author.id)) return verifyUser(message);

      addHourlyCommand(message.member);

      await redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS, "mines", 1);
      await a(message.author.id, message.author.tag, message.content);

      return prepareGame(message, args, msg);
    }
  };

  const lose = async () => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      win: false,
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
    });
    gamble(message.author, "mines", bet, false, id, 0);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(Constants.EMBED_FAIL_COLOR);
    embed.setDescription(
      "**bet** $" +
        bet.toLocaleString() +
        "\n**" +
        win.toFixed(2) +
        "**x ($" +
        Math.round(bet * win).toLocaleString() +
        ")\n\n**you lose!!**"
    );
    games.delete(message.author.id);
    return replay(embed);
  };

  const win1 = async () => {
    let winnings = Math.round(bet * win);

    embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (games.get(message.author.id).voted > 0) {
      winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

      embed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n" +
          "**" +
          win.toFixed(2) +
          "**x ($" +
          Math.round(bet * win).toLocaleString() +
          ")" +
          "\n\n**winner!!**\n**you win** $" +
          winnings.toLocaleString() +
          "\n" +
          "+**" +
          Math.floor(games.get(message.member.user.id).voted * 100).toString() +
          "**% bonus"
      );
    } else {
      embed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n" +
          "**" +
          win.toFixed(2) +
          "**x ($" +
          Math.round(bet * win).toLocaleString() +
          ")" +
          "\n\n**winner!!**\n**you win** $" +
          winnings.toLocaleString()
      );
    }

    const earnedXp = await calcEarnedXp(message.member, bet);

    if (earnedXp > 0) {
      await updateXp(message.member, (await getXp(message.member)) + earnedXp);
      embed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildByUser(message.member);

      if (guild) {
        await addToGuildXP(guild.guildName, earnedXp, message.member);
      }
    }

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      win: true,
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "mines", bet, true, id, winnings);

    if (embed.data.footer) {
      embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      embed.setFooter({ text: `id: ${id}` });
    }

    if (win >= 7) await addProgress(message.author.id, "minesweeper_pro", 1);

    await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    games.delete(message.author.id);
    return replay(embed);
  };

  const draw = async () => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      win: false,
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
    });
    gamble(message.author, "mines", bet, true, id, bet);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(variants.macchiato.yellow.hex as ColorResolvable);
    embed.setDescription(
      "**bet** $" +
        bet.toLocaleString() +
        "\n**" +
        win.toFixed(2) +
        "**x ($" +
        Math.round(bet * win).toLocaleString() +
        ")" +
        "\n\n**draw!!**\nyou win $" +
        bet.toLocaleString()
    );
    await updateBalance(message.member, (await getBalance(message.member)) + bet);
    games.delete(message.author.id);
    return replay(embed);
  };

  if (win >= 15) {
    win1();
    return;
  }

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
      message.channel.send({ content: message.author.toString() + " mines game expired" });
    });

  if (fail) return;

  if (!response) return;

  if (response.customId.length != 2 && response.customId != "finish") {
    await message.channel.send({ content: message.author.toString() + " invalid coordinate, example: `a3`" });
    return playGame(message, msg, args);
  }

  if (response.customId == "finish") {
    if (win < 1) {
      lose();
      return;
    } else if (win == 1) {
      draw();
      return;
    } else {
      win1();
      return;
    }
  } else {
    const letter = response.customId.split("")[0];
    const number = response.customId.split("")[1];

    let check = false;
    let check1 = false;

    for (const n of possibleLetters) {
      if (n == letter) {
        check = true;
        break;
      }
    }

    for (const n of possibleNumbers) {
      if (n == number) {
        check1 = true;
        break;
      }
    }

    if (!check || !check1) {
      await message.channel.send({
        content: message.author.toString() + " invalid coordinate, example: `a3`",
      });
      return playGame(message, msg, args);
    }
  }

  const location = toLocation(response.customId);

  switch (grid[location]) {
    case "b":
      grid[location] = "x";
      lose();
      return;
    case "c":
      return playGame(message, msg, args);
    case "g":
    case "a":
      if (grid[location] == "a") {
        grid[location] = "c";
      } else {
        grid[location] = "gc";
        win += 4;

        const caught = Math.floor(Math.random() * 50);

        if (caught == 7) {
          await addInventoryItem(message.member, "green_gem", 1);
          await addProgress(message.author.id, "gem_hunter", 1);
          await response.followUp({
            embeds: [
              new CustomEmbed(
                message.member,
                `${GEM_EMOJI} you found a **gem**!!\nit has been added to your inventory, i wonder what powers it has`
              ),
            ],
            ephemeral: true,
          });
        } else {
          await response.followUp({
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

      win += increment;

      games.set(message.author.id, {
        bet: bet,
        win: win,
        grid: grid,
        id: games.get(message.author.id).id,
        voted: games.get(message.author.id).voted,
        increment,
      });

      embed.setDescription(
        "**bet** $" +
          bet.toLocaleString() +
          "\n**" +
          win.toFixed(2) +
          "**x ($" +
          Math.round(bet * win).toLocaleString() +
          ")"
      );

      if (win >= 15) {
        win1();
        return;
      }

      edit({ embeds: [embed], components: getRows(grid, false) });

      return playGame(message, msg, args);
  }
}
