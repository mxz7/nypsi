import { variants } from "@catppuccin/palette";
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
import { Categories, Command, NypsiCommandInteraction } from "../models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { calcMaxBet, getBalance, getDefaultBet, getMulti, updateBalance } from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildByUser } from "../utils/functions/economy/guilds.js";
import { addGamble } from "../utils/functions/economy/stats.js";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { calcEarnedXp, getXp, updateXp } from "../utils/functions/economy/xp.js";
import { getPrefix } from "../utils/functions/guilds/utils";
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

const abcde = new Map<string, number>();
const possibleLetters = ["a", "b", "c", "d", "e"];
const possibleNumbers = ["1", "2", "3", "4", "5"];
const mineIncrements = new Map<number, number>([
  [2, 0.2],
  [3, 0.25],
  [4, 0.3],
  [5, 0.4],
  [6, 0.5],
  [7, 0.55],
  [10, 0.75],
  [15, 1],
  [20, 5],
  [23, 10],
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

  const prefix = await getPrefix(message.guild);
  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("mines help")
      .addField("usage", `${prefix}mines <bet> (mines)`)
      .addField(
        "game rules",
        "a 5x5 grid of white squares will be created\n" +
          "once youve chosen your square, it will become green if there was no mine, if there was, you will lose your bet\n" +
          "if you don't choose an amount of mines, you will be given 3-6 mines, giving you 0.5x per square"
      );

    return send({ embeds: [embed] });
  }

  const maxBet = await calcMaxBet(message.member);

  const bet = (await formatBet(args[0], message.member).catch(() => {})) || defaultBet;

  if (!bet) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (bet <= 0) {
    return send({ embeds: [new ErrorEmbed(`${prefix}ms <bet>`)] });
  }

  if (bet > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
  }

  if (bet > maxBet) {
    return send({
      embeds: [
        new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`),
      ],
    });
  }

  let chosenMinesCount = parseInt(args[1]);

  if (!chosenMinesCount) {
    chosenMinesCount = 0;
  } else if (!mineIncrements.has(chosenMinesCount)) {
    return send({
      embeds: [
        new ErrorEmbed(`you cannot use this amount of mines\nallowed: ${Array.from(mineIncrements.keys()).join(", ")}`),
      ],
    });
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
    const num = Math.floor(Math.random() * 24);

    if (grid[num] != "b") {
      grid[num] = "b";
    } else {
      i--;
    }
  }

  const voteMulti = await getMulti(message.member);

  games.set(message.author.id, {
    bet: bet,
    win: 0,
    grid: grid,
    id: id,
    voted: voteMulti,
    increment: incrementAmount,
  });

  const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)").setHeader(
    "mines",
    message.author.avatarURL()
  );

  const rows = getRows(grid, false);

  const msg = await send({ embeds: [embed], components: rows });

  playGame(message, msg).catch((e: string) => {
    logger.error(`error occured playing mines - ${message.author.tag} (${message.author.id})`);
    console.error(e);
    return send({
      embeds: [new ErrorEmbed("an error occured while running - join support server")],
    });
  });
}

cmd.setRun(run);

module.exports = cmd;

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

async function playGame(message: Message | (NypsiCommandInteraction & CommandInteraction), msg: Message): Promise<void> {
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

  const lose = async () => {
    gamble(message.author, "mines", bet, false, 0);
    await addGamble(message.member, "mines", false);
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
    return await edit({ embeds: [embed], components: getRows(grid, true) });
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

    gamble(message.author, "mines", bet, true, winnings);
    await addGamble(message.member, "mines", true);

    if (win >= 7) await addProgress(message.author.id, "mines_pro", 1);

    await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    games.delete(message.author.id);
    return await edit({ embeds: [embed], components: getRows(grid, true) });
  };

  const draw = async () => {
    gamble(message.author, "mines", bet, true, bet);
    await addGamble(message.member, "mines", true);
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
    return await edit({ embeds: [embed], components: getRows(grid, true) });
  };

  if (win == 15) {
    win1();
    return;
  }

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await msg
    .awaitMessageComponent({ filter, time: 60000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(() => {
      fail = true;
      games.delete(message.author.id);
      message.channel.send({ content: message.author.toString() + " mines game expired" });
    });

  if (fail) return;

  if (typeof response != "string") return;

  if (response.length != 2 && response != "finish") {
    await message.channel.send({ content: message.author.toString() + " invalid coordinate, example: `a3`" });
    return playGame(message, msg);
  }

  if (response == "finish") {
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
    const letter = response.split("")[0];
    const number = response.split("")[1];

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
      return playGame(message, msg);
    }
  }

  const location = toLocation(response);

  switch (grid[location]) {
    case "b":
      grid[location] = "x";
      lose();
      return;
    case "c":
      return playGame(message, msg);
    case "a":
      grid[location] = "c";

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

      edit({ embeds: [embed], components: getRows(grid, false) });

      return playGame(message, msg);
  }
}
