import { flavors } from "@catppuccin/palette";
import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  ButtonBuilder,
  ButtonComponentData,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
  OmitPartialGroupDMChannel,
  WebhookClient,
} from "discord.js";
import redis from "../init/redis.js";
import { NypsiClient } from "../models/Client.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { a } from "../utils/functions/anticheat.js";
import { giveCaptcha, isLockedOut, verifyUser } from "../utils/functions/captcha.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  getDefaultBet,
  getGambleMulti,
  removeBalance,
} from "../utils/functions/economy/balance.js";
import { addEventProgress } from "../utils/functions/economy/events.js";
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
import { hasAdminPermission } from "../utils/functions/users/admin.js";
import { recentCommands } from "../utils/functions/users/commands.js";
import { addHourlyCommand } from "../utils/handlers/commandhandler.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, getTimestamp, logger } from "../utils/logger.js";

type Game = {
  bet: number;
  win: number;
  grid: string[];
  id: number;
  multi: number;
  increment: number;
  moneyBag?: number;
};

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
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
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
          "if you don't choose an amount of mines, you will be given 3-6 mines, giving you 0.6x per square",
      );

    return send({ embeds: [embed] });
  }

  return prepareGame(message, send, args);
}

cmd.setRun(run);

module.exports = cmd;

async function prepareGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
  msg?: Message,
) {
  recentCommands.set(message.author.id, Date.now());

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

  await addCooldown(cmd.name, message.member, 10);

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
  let incrementAmount = 0.65;

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

  if (percentChance(15)) {
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

  if (percentChance(33)) {
    let passes = 0;
    let achieved = false;

    while (passes < 25 && !achieved) {
      const index = randomInt(grid.length - 1);

      if (grid[index] != "b") {
        grid[index] = "m";
        achieved = true;
        break;
      }
      passes++;
    }

    if (!achieved) {
      grid[grid.findIndex((i) => i == "a")] = "m";
    }
  }

  const multi = (await getGambleMulti(message.member, message.client as NypsiClient)).multi;

  const game: Game = {
    bet: bet,
    win: 0,
    grid: grid,
    id: id,
    multi: multi,
    increment: incrementAmount,
  };

  const desc = await renderGambleScreen({ state: "playing", bet, insert: "**0**x ($0)" });
  const embed = new CustomEmbed(message.member, desc).setHeader(
    "mines",
    message.author.avatarURL(),
  );

  const rows = getRows(grid, false);

  rows[4].components[4].setDisabled(true);

  if (msg) {
    logger.debug(`mines: ${message.author.id} updating message for replay`);
    await msg.edit({ embeds: [embed], components: rows });
  } else {
    msg = await send({ embeds: [embed], components: rows });
  }

  playGame(game, message, send, msg, args).catch((e: string) => {
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
      case "m":
        button.setStyle(ButtonStyle.Secondary);
        if (end) {
          button.setEmoji("💵").setDisabled(true);
          delete (button.data as ButtonComponentData).label;
        }
        break;
      case "mc":
        button.setStyle(ButtonStyle.Success).setDisabled(true);
        button.setEmoji("💵");
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
  game: Game,
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  msg: Message,
  args: string[],
): Promise<void> {
  const embed = new CustomEmbed(message.member).setHeader("mines", message.author.avatarURL());

  const edit = async (
    data: MessageEditOptions,
    reason: string,
    interaction?: ButtonInteraction,
  ) => {
    let res: InteractionResponse<boolean> | OmitPartialGroupDMChannel<Message<boolean>>;

    if (!interaction || interaction.deferred || interaction.replied) res = await msg.edit(data);
    else res = await interaction.update(data).catch(() => msg.edit(data));

    try {
      const updatedMsg = await res.fetch();
      logger.debug(`mines: ${message.member.id} message edited for ${reason}`, {
        embed: updatedMsg.embeds[0],
      });
    } catch {
      logger.error(`mines: ${message.author.id} failed to get response from edit`);
    }

    return res;
  };

  const replay = async (embed: CustomEmbed, interaction: ButtonInteraction, update = true) => {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    if (
      percentChance(0.05) &&
      parseInt(await redis.get(`anticheat:interactivegame:count:${message.author.id}`)) > 100
    ) {
      const res = await giveCaptcha(message.member);

      if (res) {
        logger.info(
          `${message.member.user.username} (${message.author.id}) given captcha randomly in mines`,
        );
        const hook = new WebhookClient({
          url: process.env.ANTICHEAT_HOOK,
        });
        await hook.send({
          content: `[${getTimestamp()}] ${message.member.user.username.replaceAll("_", "\\_")} (${message.author.id}) given captcha randomly in mines`,
        });
        hook.destroy();
      }
    }

    await redis.incr(`anticheat:interactivegame:count:${message.author.id}`);
    await redis.expire(`anticheat:interactivegame:count:${message.author.id}`, 86400);

    const components = getRows(game.grid, true);

    if (update) {
      if (
        !(await isPremium(message.member)) ||
        !((await getTier(message.member)) >= 2) ||
        (await getBalance(message.member)) < game.bet
      ) {
        return edit({ embeds: [embed], components: getRows(game.grid, true) }, "end", interaction);
      }

      const renderAndListen = async () => {
        (
          components[components.length - 1].components[
            components[components.length - 1].components.length - 1
          ] as ButtonBuilder
        )
          .setCustomId("rp")
          .setLabel("play again")
          .setDisabled(false);

        await edit({ embeds: [embed], components }, "end with play again", interaction);

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

        if (!res) return;

        if (res.customId == "rp") {
          await res.deferUpdate();
          logger.info(
            `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying mines`,
            { userId: message.author.id, guildId: message.guildId, channelId: message.channelId },
          );

          if (await isLockedOut(message.member)) {
            await verifyUser(message);
            return;
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
            if (
              (await hasAdminPermission(message.member, "bypass-maintenance")) &&
              message instanceof Message
            ) {
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

          return prepareGame(message, send, args, msg);
        } else {
          logger.debug(`mines: ${message.author.id} rerendering end (replay) message`);
          return renderAndListen();
        }
      };

      renderAndListen();
    }
  };

  const lose = async (interaction: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "mines",
      result: "lose",
      outcome: `mines:${JSON.stringify(getRows(game.grid, true))}`,
      earned: game.moneyBag,
    });
    gamble(message.author, "mines", game.bet, "lose", id, 0);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(Constants.EMBED_FAIL_COLOR);
    const desc = await renderGambleScreen({
      state: "lose",
      bet: game.bet,
      insert: `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
    });
    embed.setDescription(desc);
    return replay(embed, interaction);
  };

  const win1 = async (interaction?: ButtonInteraction) => {
    let winnings = Math.round(game.bet * game.win);

    embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (game.multi > 0) {
      winnings = winnings + Math.round(winnings * game.multi);
    }

    const eventProgress = await addEventProgress(
      message.client as NypsiClient,
      message.member,
      "mines",
      1,
    );

    const desc = await renderGambleScreen({
      state: "win",
      bet: game.bet,
      insert: `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
      winnings,
      multiplier: game.multi,
      eventProgress,
    });
    embed.setDescription(desc);

    const earnedXp = await calcEarnedGambleXp(
      message.member,
      message.client as NypsiClient,
      game.bet,
      game.win,
    );

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
      bet: game.bet,
      game: "mines",
      result: "win",
      outcome: `mines:${JSON.stringify(getRows(game.grid, true))}`,
      earned: winnings + (game.moneyBag ? game.moneyBag : 0),
      xp: earnedXp,
    });
    gamble(message.author, "mines", game.bet, "win", id, winnings);

    if (earnedXp > 0) {
      embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      embed.setFooter({ text: `id: ${id}` });
    }

    await addBalance(message.member, winnings);
    return replay(embed, interaction);
  };

  const draw = async (interaction: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: game.bet,
      game: "mines",
      result: "draw",
      outcome: `mines:${JSON.stringify(getRows(game.grid, true))}`,
      earned: game.bet + (game.moneyBag ? game.moneyBag : 0),
    });
    gamble(message.author, "mines", game.bet, "draw", id, game.bet);
    embed.setFooter({ text: `id: ${id}` });
    embed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);
    const desc = await renderGambleScreen({
      state: "draw",
      bet: game.bet,
      insert: `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
    });
    embed.setDescription(desc);
    await addBalance(message.member, game.bet);
    return replay(embed, interaction);
  };

  if (game.win >= 15) {
    win1();
    return;
  }

  const filter = (i: Interaction) => i.user.id == message.author.id;
  let fail = false;

  const response = await msg
    .awaitMessageComponent({ filter, time: 90000 })
    .then(async (collected) => {
      setTimeout(() => {
        if (!collected.deferred && !collected.replied) {
          collected.deferUpdate().catch((e) => {
            logger.error(`mines: ${message.author.id} failed to defer update`, e);
            console.error(e);
          });
        }
      }, 2000);
      return collected as ButtonInteraction;
    })
    .catch((e) => {
      logger.warn(`mines: ${message.author.id} interaction error`, e);
      fail = true;
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: message.author.toString() + " mines game expired" });
    });

  if (fail) return;

  if (!response) return;

  logger.debug(`mines: ${message.author.id} received interaction: ${response.customId}`);

  if (response.customId.length != 2 && response.customId != "finish") {
    logger.error(`mines: ${message.author.id} weird coordinate thing`, { response, game });
    await message.channel.send({
      content: message.author.toString() + " invalid coordinate, example: `a3`",
    });
    return playGame(game, message, send, msg, args);
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
  } else if (response.customId === "rp") {
    logger.debug(`mines: ${message.author.id} rerendering stuck message`);

    const desc = await renderGambleScreen({
      state: "playing",
      bet: game.bet,
      insert: `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
    });
    embed.setDescription(desc);

    const components = getRows(game.grid, false);

    edit({ embeds: [embed], components }, "rerendering stuck message", response);
    return playGame(game, message, send, msg, args);
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
      return playGame(game, message, send, msg, args);
    }
  }

  const location = toLocation(response.customId);

  let followUp: InteractionReplyOptions;

  logger.debug(`mines: ${message.author.id} at location: ${game.grid[location]}`);

  switch (game.grid[location]) {
    case "b":
      game.grid[location] = "x";
      lose(response);
      return;
    case "c":
      return playGame(game, message, send, msg, args);
    case "g":
    case "m":
    case "a":
      if (game.grid[location] == "a") {
        game.grid[location] = "c";
      } else if (game.grid[location] === "m") {
        game.grid[location] = "mc";

        const amount = (Math.random() * 66.6666666 + 33.3333333) / 100;

        game.moneyBag = Math.floor(game.bet * amount);
        await addBalance(message.member, game.moneyBag);

        followUp = {
          embeds: [
            new CustomEmbed(
              message.member,
              `💵 you found $**${game.moneyBag.toLocaleString()}**!!`,
            ),
          ],
        };
      } else if (game.grid[location] === "g") {
        game.grid[location] = "gc";
        game.win += 3;

        addProgress(message.author.id, "minesweeper_pro", 1);

        if (percentChance(0.5) && !(await redis.exists(Constants.redis.nypsi.GEM_GIVEN))) {
          await redis.set(Constants.redis.nypsi.GEM_GIVEN, "t", "EX", 86400);
          logger.info(`${message.author.id} received green_gem randomly (mines)`);
          addInventoryItem(message.member, "green_gem", 1);
          addProgress(message.author.id, "gem_hunter", 1);
          followUp = {
            embeds: [
              new CustomEmbed(
                message.member,
                `${GEM_EMOJI} you found a **gem**!!\nit has been added to your inventory, i wonder what powers it has`,
              ),
            ],
            flags: MessageFlags.Ephemeral,
          };
        }
      }

      game.win += game.increment;

      logger.debug(`mines: ${message.author.id} rendering`);
      const desc = await renderGambleScreen({
        state: "playing",
        bet: game.bet,
        insert: `**${game.win.toFixed(2)}**x ($${Math.round(game.bet * game.win).toLocaleString()})`,
      });
      embed.setDescription(desc);

      if (game.win >= 15) {
        win1(response);
        return;
      }

      const components = getRows(game.grid, false);

      if (game.win < 1) {
        components[4].components[4].setDisabled(true);
      }

      logger.debug(`mines: ${message.author.id} editing`);

      edit({ embeds: [embed], components }, "rerendering game", response).then(() => {
        if (followUp) {
          response.followUp(followUp).catch(() => {
            logger.warn(`mines: ${message.author.id} failed to send follow up`, followUp);
          });
        }
      });

      return playGame(game, message, send, msg, args);
  }
}
