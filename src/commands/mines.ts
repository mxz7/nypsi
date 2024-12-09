import { flavors } from "@catppuccin/palette";
import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonComponentData,
  ButtonInteraction,
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
import { NypsiClient } from "../models/Client.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { a } from "../utils/functions/anticheat.js";
import { isLockedOut, verifyUser } from "../utils/functions/captcha.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  getDefaultBet,
  getGambleMulti,
  removeBalance,
} from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds.js";
import { addInventoryItem } from "../utils/functions/economy/inventory.js";
import { createGame } from "../utils/functions/economy/stats.js";
import {
  createUser,
  formatBet,
  renderGambleScreen,
  userExists,
} from "../utils/functions/economy/utils.js";
import { addXp, calcEarnedGambleXp } from "../utils/functions/economy/xp.js";
import { getTier, isPremium } from "../utils/functions/premium/premium.js";
import { percentChance } from "../utils/functions/random.js";
import { recentCommands } from "../utils/functions/users/commands.js";
import { addHourlyCommand } from "../utils/handlers/commandhandler.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, logger } from "../utils/logger.js";
import ms = require("ms");

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

const GEM_EMOJI = "<:nypsi_gem:1046854542047850556>";
const abcde = new Map<string, number>();
const possibleLetters = ["a", "b", "c", "d", "e"];
const possibleNumbers = ["1", "2", "3", "4", "5"];
const mineIncrements = new Map<number, number>([
  [2, 0.25],
  [3, 0.3],
  [4, 0.4],
  [5, 0.45],
  [6, 0.5],
  [7, 0.55],
  [10, 1.25],
  [15, 1.8],
  [20, 4.5],
  [23, 17],
]);

abcde.set("a", 0);
abcde.set("b", 1);
abcde.set("c", 2);
abcde.set("d", 3);
abcde.set("e", 4);

const cmd = new Command("mines", "play mines", "money").setAliases(["minesweeper", "ms"]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName("mine-count")
      .setDescription("how many mines do you want in your game")
      .setChoices(
        ...(Array.from(mineIncrements.keys()).map((n) => {
          return { name: n.toString(), value: n };
        }) as APIApplicationCommandOptionChoice<number>[]),
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
    return send({ embeds: [new ErrorEmbed("you are already playing mines")] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
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
          "if you don't choose an amount of mines, you will be given 3-6 mines, giving you 0.5x per square",
      );

    return send({ embeds: [embed] });
  }

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
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you are already playing mines")] });
    } else {
      return send({ embeds: [new ErrorEmbed("you are already playing mines")] });
    }
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  const [maxBet, defaultBet] = await Promise.all([
    calcMaxBet(message.member),
    getDefaultBet(message.member),
  ]);

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
          new ErrorEmbed(
            `you cannot use this amount of mines\nallowed: ${Array.from(mineIncrements.keys()).join(
              ", ",
            )}`,
          ),
        ],
      });
    } else {
      return send({
        embeds: [
          new ErrorEmbed(
            `you cannot use this amount of mines\nallowed: ${Array.from(mineIncrements.keys()).join(
              ", ",
            )}`,
          ),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 15);

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        games.delete(message.author.id);
        await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        await addBalance(message.member, bet);
      }
    }
  }, 180000);

  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

  await removeBalance(message.member, bet);

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
  let incrementAmount = 0.55;

  if (chosenMinesCount == 0) {
    bombCount = Math.floor(Math.random() * 4) + 4;
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

  if (percentChance(20)) {
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

  const multi = (await getGambleMulti(message.member)).multi;

  games.set(message.author.id, {
    bet: bet,
    win: 0,
    grid: grid,
    id: id,
    voted: multi,
    increment: incrementAmount,
  });

  setTimeout(() => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        const game = games.get(message.author.id);
        games.delete(message.author.id);
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        logger.warn("mines still in playing state after 5 minutes - deleting key", game);
      }
    }
  }, ms("5 minutes"));

  const desc = await renderGambleScreen(message.author.id, "playing", bet, "**0**x ($0)");
  const embed = new CustomEmbed(message.member, desc).setHeader(
    "mines",
    message.author.avatarURL(),
  );

  const rows = getRows(grid, false);

  rows[4].components[4].setDisabled(true);

  if (msg) {
    await msg.edit({ embeds: [embed], components: rows });
  } else {
    msg = await send({ embeds: [embed], components: rows });
  }

  playGame(message, msg, args).catch((e: string) => {
    logger.error(
      `error occurred playing mines - ${message.author.id} (${message.author.username})`,
    );
    console.error(e);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    return send({
      embeds: [new ErrorEmbed("an error occurred while running - join support server")],
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
        if (end) {
          button.setEmoji(GEM_EMOJI).setDisabled(true);
          delete (button.data as ButtonComponentData).label;
        }
        break;
      case "gc":
        button.setStyle(ButtonStyle.Success).setDisabled(true);
        button.setEmoji(GEM_EMOJI);
        delete (button.data as ButtonComponentData).label;
        break;
      case "x":
        button.setEmoji("💥").setStyle(ButtonStyle.Danger).setDisabled(true);
        delete (button.data as ButtonComponentData).label;
        break;
    }

    current.addComponents(button);
  }

  const button = new ButtonBuilder()
    .setCustomId("finish")
    .setLabel("finish")
    .setStyle(ButtonStyle.Success);

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
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  msg: Message,
  args: string[],
): Promise<void> {
  if (!games.has(message.author.id)) return;

  const bet = games.get(message.author.id).bet;
  let win = games.get(message.author.id).win;
  const grid = games.get(message.author.id).grid;
  const increment = games.get(message.author.id).increment;

  const embed = new CustomEmbed(message.member).setHeader("mines", message.author.avatarURL());

  const edit = async (data: MessageEditOptions, interaction: ButtonInteraction) => {
    if (!interaction || interaction.deferred || interaction.replied) return msg.edit(data);
    return interaction.update(data).catch(() => msg.edit(data));
  };

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction, update = true) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    const components = getRows(grid, true);

    if (update) {
      if (
        !(await isPremium(message.member)) ||
        !((await getTier(message.member)) >= 2) ||
        (await getBalance(message.member)) < bet
      ) {
        return edit({ embeds: [embed], components: getRows(grid, true) }, interaction);
      }

      (
        components[components.length - 1].components[
          components[components.length - 1].components.length - 1
        ] as ButtonBuilder
      )
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
      logger.info(`::cmd ${message.guild.id} ${message.author.username}: replaying mines`);
      if (await isLockedOut(message.author.id)) {
        await verifyUser(message);
        return replay(embed, interaction, false);
      }

      addHourlyCommand(message.member);

      a(message.author.id, message.author.username, message.content, "mines");

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
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      result: "lose",
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
    });
    gamble(message.author, "mines", bet, "lose", id, 0);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(Constants.EMBED_FAIL_COLOR);
    const desc = await renderGambleScreen(
      message.author.id,
      "lose",
      bet,
      `**${win.toFixed(2)}**x ($${Math.round(bet * win).toLocaleString()})`,
    );
    embed.setDescription(desc);
    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const win1 = async (interaction?: ButtonInteraction) => {
    let winnings = Math.round(bet * win);

    embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (games.get(message.author.id).voted > 0) {
      winnings = winnings + Math.round(winnings * games.get(message.author.id).voted);
    }

    const desc = await renderGambleScreen(
      message.author.id,
      "win",
      bet,
      `**${win.toFixed(2)}**x ($${Math.round(bet * win).toLocaleString()})`,
      winnings,
      games.get(message.author.id).voted,
    );
    embed.setDescription(desc);

    const earnedXp = await calcEarnedGambleXp(message.member, bet, win);

    if (earnedXp > 0) {
      await addXp(message.member, earnedXp);
      embed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildName(message.member);

      if (guild) {
        await addToGuildXP(guild, earnedXp, message.member);
      }
    }

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      result: "win",
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "mines", bet, "win", id, winnings);

    if (earnedXp > 0) {
      embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      embed.setFooter({ text: `id: ${id}` });
    }

    if (win >= 7) addProgress(message.author.id, "minesweeper_pro", 1);

    await addBalance(message.member, winnings);
    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  const draw = async (interaction: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "mines",
      result: "draw",
      outcome: `mines:${JSON.stringify(getRows(grid, true))}`,
      earned: bet,
    });
    gamble(message.author, "mines", bet, "draw", id, bet);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);
    const desc = await renderGambleScreen(
      message.author.id,
      "draw",
      bet,
      `**${win.toFixed(2)}**x ($${Math.round(bet * win).toLocaleString()})`,
    );
    embed.setDescription(desc);
    await addBalance(message.member, bet);
    games.delete(message.author.id);
    return replay(embed, interaction);
  };

  if (win >= 15) {
    win1();
    return;
  }

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await msg
    .awaitMessageComponent({ filter, time: 90000 })
    .then(async (collected) => {
      setTimeout(() => {
        collected.deferUpdate().catch(() => null);
      }, 1500);
      return collected as ButtonInteraction;
    })
    .catch((e) => {
      logger.warn("mines error", e);
      fail = true;
      games.delete(message.author.id);
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: message.author.toString() + " mines game expired" });
    });

  if (fail) return;

  if (!response) return;

  if (response.customId.length != 2 && response.customId != "finish") {
    logger.error("WEIRD MINES COORDINATE THING", { response, game: games.get(message.author.id) });
    await message.channel.send({
      content: message.author.toString() + " invalid coordinate, example: `a3`",
    });
    return playGame(message, msg, args);
  }

  if (response.customId == "finish") {
    if (win < 1) {
      lose(response);
      return;
    } else if (win == 1) {
      draw(response);
      return;
    } else {
      win1(response);
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
      lose(response);
      return;
    case "c":
      return playGame(message, msg, args);
    case "g":
    case "a":
      if (grid[location] == "a") {
        grid[location] = "c";
      } else {
        grid[location] = "gc";
        win += 3;

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

      win += increment;

      games.set(message.author.id, {
        bet: bet,
        win: win,
        grid: grid,
        id: games.get(message.author.id).id,
        voted: games.get(message.author.id).voted,
        increment,
      });

      const desc = await renderGambleScreen(
        message.author.id,
        "playing",
        bet,
        `**${win.toFixed(2)}**x ($${Math.round(bet * win).toLocaleString()})`,
      );
      embed.setDescription(desc);

      if (win >= 15) {
        win1(response);
        return;
      }

      const components = getRows(grid, false);

      if (win < 1) {
        components[4].components[4].setDisabled(true);
      }

      edit({ embeds: [embed], components }, response);

      return playGame(message, msg, args);
  }
}
