import { flavors } from "@catppuccin/palette";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import redis from "../init/redis.js";
import { NypsiClient } from "../models/Client.js";
import { Command, NypsiCommandInteraction } from "../models/Command.js";
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
import { createGame } from "../utils/functions/economy/stats.js";
import {
  createUser,
  formatBet,
  renderGambleScreen,
  userExists,
} from "../utils/functions/economy/utils.js";
import { calcEarnedGambleXp, getXp, updateXp } from "../utils/functions/economy/xp.js";
import { getTier, isPremium } from "../utils/functions/premium/premium.js";
import { shuffle } from "../utils/functions/random.js";
import { recentCommands } from "../utils/functions/users/commands.js";
import { addHourlyCommand } from "../utils/handlers/commandhandler.js";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble, logger } from "../utils/logger.js";

const games = new Map<
  string,
  {
    bet: number;
    win: number;
    deck: string[];
    card: string;
    id: number;
    voted: number;
    oldCard?: string;
  }
>();

const cmd = new Command("highlow", "higher or lower game", "money").setAliases(["hl"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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

  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("highlow help")
      .addField("usage", "/highlow <bet>")
      .addField(
        "game rules",
        "you'll receive your first card and you have to predict whether the next card you pick up will be higher or lower in value than the card that you have, you can cash out after predicting correctly once.",
      )
      .addField(
        "help",
        "**A**ce | value of 1\n**J**ack | value of 11\n" +
          "**Q**ueen | value of 12\n**K**ing | value of 13\n" +
          "⬆ **higher** the next card will be higher in value than your current card\n" +
          "⬇ **lower** the next card will be lower in value than your current card\n" +
          "💰 **cash out** end the game and receive the current win\nmax win **15**x",
      );

    return send({ embeds: [embed] });
  }

  if (args[0] == "info") {
    const embed = new CustomEmbed(
      message.member,
      "highlow works exactly how it would in real life\n" +
        "when you create a game, a full 52 deck is shuffled in a random order\n" +
        "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
        "view the code for this [here](https://github.com/mxz7/nypsi/blob/main/src/commands/highlow.ts)",
    ).setHeader("highlow help");

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
      return msg.edit({ embeds: [new ErrorEmbed("/highlow <bet>")] });
    } else {
      return send({ embeds: [new ErrorEmbed("/highlow <bet>")] });
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

  if (games.has(message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you are already playing highlow")] });
    } else {
      return send({ embeds: [new ErrorEmbed("you are already playing highlow")] });
    }
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    if (msg) {
      return msg.edit({ embeds: [new ErrorEmbed("you have an active game")], components: [] });
    }
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  await addCooldown(cmd.name, message.member, 15);
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

  const voteMulti = (await getGambleMulti(message.member)).multi;

  games.set(message.author.id, {
    bet: bet,
    win: 0,
    deck: shuffle(newDeck),
    card: "",
    id: id,
    voted: voteMulti,
  });

  setTimeout(async () => {
    if (games.has(message.author.id)) {
      if (games.get(message.author.id).id == id) {
        games.delete(message.author.id);
        await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        await addBalance(message.member, bet);
      }
    }
  }, 180000);

  newCard(message.member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("💰")
      .setLabel("cash out")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );

  const desc = await renderGambleScreen(message.author.id, "playing", bet, `**0**x ($0)`);

  const embed = new CustomEmbed(message.member, desc)
    .setHeader("highlow", message.author.avatarURL())
    .addField("card", "| " + games.get(message.author.id).card + " |");

  if (msg) {
    await msg.edit({ embeds: [embed], components: [row] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  playGame(message, msg, args).catch((e) => {
    logger.error(
      `error occurred playing highlow - ${message.author.id} (${message.author.username})`,
    );
    logger.error("highlow error", e);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    return send({
      embeds: [new ErrorEmbed("an error occurred while running - join support server")],
    });
  });
}

function newCard(member: GuildMember) {
  const oldCard = games.get(member.user.id).card;
  const deck = games.get(member.user.id).deck;

  const choice = deck[0];

  deck.shift();

  games.set(member.user.id, {
    bet: games.get(member.user.id).bet,
    win: games.get(member.user.id).win,
    deck: deck,
    card: choice,
    id: games.get(member.user.id).id,
    voted: games.get(member.user.id).voted,
    oldCard,
  });
}

function getValue(member: GuildMember) {
  const card = games.get(member.user.id).card.toLowerCase();

  if (card.includes("k")) {
    return 13;
  } else if (card.includes("q")) {
    return 12;
  } else if (card.includes("j")) {
    return 11;
  } else if (card.includes("a")) {
    return 1;
  } else {
    if (!parseInt(card)) {
      return "ERROR";
    }
    return parseInt(card);
  }
}

async function playGame(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  m: Message,
  args: string[],
): Promise<void> {
  if (!games.has(message.author.id)) return;

  const bet = games.get(message.author.id).bet;
  let win = games.get(message.author.id).win;
  let card = games.get(message.author.id).card;

  const newEmbed = new CustomEmbed(message.member).setHeader("highlow", message.author.avatarURL());

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
      logger.info(`::cmd ${message.guild.id} ${message.author.username}: replaying highlow`);
      if (await isLockedOut(message.author.id)) return verifyUser(message);

      addHourlyCommand(message.member);

      await a(message.author.id, message.author.username, message.content);

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
        if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
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

      return prepareGame(message, args, m);
    }
  };

  const lose = async (interaction: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "highlow",
      result: "lose",
      outcome: `**old card** ${games.get(message.author.id).oldCard}\n**new card** ${
        games.get(message.author.id).card
      }`,
    });
    gamble(message.author, "highlow", bet, "lose", id, 0);
    newEmbed.setFooter({ text: `id: ${id}` });
    newEmbed.setColor(Constants.EMBED_FAIL_COLOR);
    const desc = await renderGambleScreen(
      message.author.id,
      "lose",
      bet,
      `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
    );
    newEmbed.setDescription(desc);
    newEmbed.addField("card", "| " + card + " |");
    games.delete(message.author.id);
    return replay(newEmbed, interaction);
  };

  const win1 = async (interaction?: ButtonInteraction) => {
    let winnings = Math.round(bet * win);

    newEmbed.setColor(Constants.EMBED_SUCCESS_COLOR);
    if (games.get(message.author.id).voted > 0) {
      winnings = winnings + Math.round(winnings * games.get(message.author.id).voted);
    }

    const desc = await renderGambleScreen(
      message.author.id,
      "win",
      bet,
      `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
      winnings,
      games.get(message.author.id).voted,
    );

    newEmbed.setDescription(desc);

    const earnedXp = await calcEarnedGambleXp(message.member, bet, win);

    if (earnedXp > 0) {
      await updateXp(message.member, (await getXp(message.member)) + earnedXp);
      newEmbed.setFooter({ text: `+${earnedXp}xp` });

      const guild = await getGuildName(message.member);

      if (guild) {
        await addToGuildXP(guild, earnedXp, message.member);
      }
    }

    if (win >= 7) addProgress(message.author.id, "highlow_pro", 1);

    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "highlow",
      result: "win",
      outcome: `**old card** ${games.get(message.author.id).oldCard}\n**new card** ${
        games.get(message.author.id).card
      }`,
      earned: winnings,
      xp: earnedXp,
    });
    gamble(message.author, "highlow", bet, "win", id, winnings);

    if (earnedXp > 0) {
      newEmbed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
    } else {
      newEmbed.setFooter({ text: `id: ${id}` });
    }

    newEmbed.addField("card", "| " + card + " |");
    await addBalance(message.member, winnings);
    games.delete(message.author.id);
    return replay(newEmbed, interaction);
  };

  const draw = async (interaction: ButtonInteraction) => {
    const id = await createGame({
      userId: message.author.id,
      bet: bet,
      game: "highlow",
      result: "draw",
      outcome: `**old card** ${games.get(message.author.id).oldCard}\n**new card** ${
        games.get(message.author.id).card
      }`,
      earned: bet,
    });
    gamble(message.author, "highlow", bet, "draw", id, bet);
    newEmbed.setFooter({ text: `id: ${id}` });
    newEmbed.setColor(flavors.macchiato.colors.yellow.hex as ColorResolvable);
    const desc = await renderGambleScreen(
      message.author.id,
      "draw",
      bet,
      `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
    );
    newEmbed.setDescription(desc);
    newEmbed.addField("card", "| " + card + " |");
    await addBalance(message.member, bet);
    games.delete(message.author.id);
    return replay(newEmbed, interaction);
  };

  if (win == 15) {
    win1();
    return;
  }

  const filter = (i: Interaction) => i.user.id == message.author.id;

  let fail = false;

  const reaction = await m
    .awaitMessageComponent({ filter, time: 90000 })
    .then(async (collected) => {
      setTimeout(() => {
        collected.deferUpdate().catch(() => null);
      }, 1500);
      return collected as ButtonInteraction;
    })
    .catch((e) => {
      logger.warn("hl error", e);
      fail = true;
      games.delete(message.author.id);
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: message.author.toString() + " highlow game expired" });
    });

  if (fail || !reaction) return;

  if (reaction.customId == "⬆") {
    const oldCard = getValue(message.member);
    newCard(message.member);
    card = games.get(message.author.id).card;
    const newCard1 = getValue(message.member);

    if (newCard1 > oldCard) {
      if (win == 0) {
        win += 1;
      } else if (win > 5) {
        win += 1;
      } else {
        win += 0.5;
      }

      games.set(message.author.id, {
        bet: bet,
        win: win,
        deck: games.get(message.author.id).deck,
        card: games.get(message.author.id).card,
        id: games.get(message.author.id).id,
        voted: games.get(message.author.id).voted,
      });

      let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("💰")
          .setLabel("cash out")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
      );

      if (win >= 1) {
        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("💰")
            .setLabel("cash out")
            .setStyle(ButtonStyle.Success)
            .setDisabled(false),
        );
      }

      const desc = await renderGambleScreen(
        message.author.id,
        "playing",
        bet,
        `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
      );
      newEmbed.setDescription(desc);
      newEmbed.addField("card", "| " + card + " |");
      await edit({ embeds: [newEmbed], components: [row] }, reaction);
      return playGame(message, m, args);
    } else if (newCard1 == oldCard) {
      const desc = await renderGambleScreen(
        message.author.id,
        "playing",
        bet,
        `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
      );
      newEmbed.setDescription(desc);
      newEmbed.addField("card", "| " + card + " |");

      await edit({ embeds: [newEmbed] }, reaction);
      return playGame(message, m, args);
    } else {
      lose(reaction);
      return;
    }
  } else if (reaction.customId == "⬇") {
    const oldCard = getValue(message.member);
    newCard(message.member);
    card = games.get(message.author.id).card;
    const newCard1 = getValue(message.member);

    if (newCard1 < oldCard) {
      if (win < 2) {
        win += 0.5;
      } else {
        win += 1;
      }

      games.set(message.author.id, {
        bet: bet,
        win: win,
        deck: games.get(message.author.id).deck,
        card: games.get(message.author.id).card,
        id: games.get(message.author.id).id,
        voted: games.get(message.author.id).voted,
      });

      let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("💰")
          .setLabel("cash out")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
      );

      if (win >= 1) {
        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("💰")
            .setLabel("cash out")
            .setStyle(ButtonStyle.Success)
            .setDisabled(false),
        );
      }

      const desc = await renderGambleScreen(
        message.author.id,
        "playing",
        bet,
        `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
      );
      newEmbed.setDescription(desc);
      newEmbed.addField("card", "| " + card + " |");
      await edit({ embeds: [newEmbed], components: [row] }, reaction);
      return playGame(message, m, args);
    } else if (newCard1 == oldCard) {
      const desc = await renderGambleScreen(
        message.author.id,
        "playing",
        bet,
        `**${win}**x ($${Math.round(bet * win).toLocaleString()})`,
      );
      newEmbed.setDescription(desc);
      newEmbed.addField("card", "| " + card + " |");
      await edit({ embeds: [newEmbed] }, reaction);
      return playGame(message, m, args);
    } else {
      lose(reaction);
      return;
    }
  } else if (reaction.customId == "💰") {
    if (win < 1) {
      return playGame(message, m, args);
    } else if (win == 1) {
      draw(reaction);
      return;
    } else {
      win1(reaction);
      return;
    }
  } else {
    games.delete(message.author.id);
    redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    m.reactions.removeAll();
    return;
  }
}
