import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  getDefaultBet,
  getGambleMulti,
  removeBalance,
} from "../utils/functions/economy/balance.js";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds.js";
import { createGame } from "../utils/functions/economy/stats";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { addXp, calcEarnedGambleXp } from "../utils/functions/economy/xp.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { shuffle } from "../utils/functions/random";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble } from "../utils/logger.js";

const cmd = new Command("rps", "play rock paper scissors", "money").setAliases([
  "rockpaperscissors",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option
      .setName("choice")
      .setDescription("choice for the bet")
      .setRequired(true)
      .setChoices(
        { name: "🗿 rock", value: "rock" },
        { name: "📰 paper", value: "paper" },
        { name: "✂ scissors", value: "scissors" },
      ),
  )
  .addStringOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

  const prefix = (await getPrefix(message.guild))[0];
  const defaultBet = await getDefaultBet(message.member);

  if ((args.length == 0 || args.length == 1) && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("rockpaperscissors help")
      .addField("usage", `${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)
      .addField(
        "help",
        "rock paper scissors works exactly how this game does in real life\n" +
          "**2**x multiplier for winning",
      );

    return send({ embeds: [embed] });
  }

  let choice = args[0];
  let memberEmoji = "";

  if (
    choice != "rock" &&
    choice != "paper" &&
    choice != "scissors" &&
    choice != "r" &&
    choice != "p" &&
    choice != "s"
  ) {
    return send({
      embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
    });
  }

  if (choice == "r") choice = "rock";
  if (choice == "p") choice = "paper";
  if (choice == "s") choice = "scissors";

  if (choice == "rock") memberEmoji = "🗿";
  if (choice == "paper") memberEmoji = "📰";
  if (choice == "scissors") memberEmoji = "✂";

  const maxBet = await calcMaxBet(message.member);

  const bet = (await formatBet(args[1], message.member).catch(() => {})) || defaultBet;

  if (!bet) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (!bet) {
    return send({
      embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
    });
  }

  if (bet <= 0) {
    return send({
      embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
    });
  }

  if (bet > (await getBalance(message.member))) {
    return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
  }

  if (bet > maxBet) {
    return send({
      embeds: [
        new ErrorEmbed(
          `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`,
        ),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 10);

  const values = ["rock", "paper", "scissors"];

  const index = values.indexOf(choice);

  if (index > -1) {
    values.splice(index, 1);
  }

  let winning = shuffle(values)[Math.floor(Math.random() * values.length)];

  if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, message.author.id)) {
    while (
      choice == "rock"
        ? winning != "paper"
        : choice == "paper"
          ? winning != "scissors"
          : choice == "scissors"
            ? winning != "rock"
            : false
    ) {
      winning = shuffle(values)[Math.floor(Math.random() * values.length)];
    }
  }

  let winningEmoji = "";

  if (winning == "rock") winningEmoji = "🗿";
  if (winning == "paper") winningEmoji = "📰";
  if (winning == "scissors") winningEmoji = "✂";

  let win = false;
  let winnings = 0;

  if (choice == "rock" && winning == "scissors") {
    win = true;

    winnings = Math.round(bet * 1.5);
  } else if (choice == "paper" && winning == "rock") {
    win = true;

    winnings = Math.round(bet * 1.5);
  } else if (choice == "scissors" && winning == "paper") {
    win = true;

    winnings = Math.round(bet * 1.5);
  }

  let multi = 0;

  if (win) {
    multi = (await getGambleMulti(message.member)).multi;

    winnings -= bet;

    if (multi > 0) {
      await addBalance(message.member, winnings + Math.round(winnings * multi));
      winnings = winnings + Math.round(winnings * multi);
    } else {
      await addBalance(message.member, winnings);
    }
  } else {
    await removeBalance(message.member, bet);
  }

  winnings += bet;

  const embed = new CustomEmbed(
    message.member,
    "*rock..paper..scissors..* **shoot!!**\n\n**choice** " +
      choice +
      " " +
      memberEmoji +
      "\n**bet** $" +
      bet.toLocaleString(),
  ).setHeader("rock paper scissors", message.author.avatarURL());

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  send({ embeds: [embed] }).then(async (m) => {
    embed.setDescription(
      "**threw** " +
        winning +
        " " +
        winningEmoji +
        "\n\n**choice** " +
        choice +
        " " +
        memberEmoji +
        "\n**bet** $" +
        bet.toLocaleString(),
    );

    let id: string;

    if (win) {
      if (multi > 0) {
        embed.addField(
          "**winner!!**",
          "**you win** $" +
            winnings.toLocaleString() +
            "\n" +
            "+**" +
            Math.round(multi * 100).toString() +
            "**% bonus",
        );
      } else {
        embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString());
      }

      const earnedXp = await calcEarnedGambleXp(message.member, bet, 1.5);

      if (earnedXp > 0) {
        await addXp(message.member, earnedXp);
        embed.setFooter({ text: `+${earnedXp}xp` });

        const guild = await getGuildName(message.member);

        if (guild) {
          await addToGuildXP(guild, earnedXp, message.member);
        }
      }

      id = await createGame({
        userId: message.author.id,
        bet: bet,
        game: "rps",
        outcome: `**choice** ${choice}\n**landed** ${winning}`,
        result: "win",
        earned: winnings,
        xp: earnedXp,
      });

      if (embed.data.footer && !embed.data.footer.text.includes("nypsi")) {
        embed.setFooter({ text: `+${earnedXp}xp | id: ${id}` });
      } else {
        embed.setFooter({ text: `id: ${id}` });
      }

      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
    } else {
      embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString());
      embed.setColor(Constants.EMBED_FAIL_COLOR);
      id = await createGame({
        userId: message.author.id,
        bet: bet,
        game: "rps",
        outcome: `**choice** ${choice}\n**landed** ${winning}`,
        result: "lose",
      });
      embed.setFooter({ text: `id: ${id}` });
    }

    gamble(message.author, "rock paper scissors", bet, win ? "win" : "lose", id, winnings);
    setTimeout(() => {
      edit({ embeds: [embed] }, m);
    }, 1500);
  });
}

cmd.setRun(run);

module.exports = cmd;
