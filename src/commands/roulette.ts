import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
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
import { createGame } from "../utils/functions/economy/stats";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { calcEarnedGambleXp, getXp, updateXp } from "../utils/functions/economy/xp.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { shuffle } from "../utils/functions/random";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble } from "../utils/logger.js";

const values = [
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "g",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
  "b",
  "r",
];

const cmd = new Command("roulette", "play roulette", "money").setAliases(["r"]);

cmd.slashEnabled = true;
cmd.slashData
  .addStringOption((option) =>
    option
      .setName("color")
      .setDescription("color to bet on")
      .setRequired(true)
      .setChoices(
        { name: "🔴 red", value: "red" },
        { name: "⚫ black", value: "black" },
        { name: "🟢 green", value: "green" },
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
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  if (args.length == 1 && args[0].toLowerCase() == "odds") {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "🔴 " +
            (values.length - 1) / 2 +
            "/" +
            values.length +
            " win **1.5**x\n" +
            "⚫ " +
            (values.length - 1) / 2 +
            "/" +
            values.length +
            " win **1.5**x\n" +
            "🟢 1/" +
            values.length +
            " win **17**x",
        ),
      ],
    });
  }

  const prefix = (await getPrefix(message.guild))[0];
  const defaultBet = await getDefaultBet(message.member);

  if (args.length != 2 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("roulette help")
      .addField(
        "usage",
        `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet>\n${prefix}roulette odds`,
      )
      .addField(
        "help",
        "this is a bit of a simpler version of real roulette, as in you can only bet on red, black and green which mimics typical csgo roulette\n" +
          "red and black give a **1.5x** win and green gives a **17**x win",
      );

    return send({ embeds: [embed] });
  }

  if (
    args[0] != "red" &&
    args[0] != "green" &&
    args[0] != "black" &&
    args[0] != "r" &&
    args[0] != "g" &&
    args[0] != "b"
  ) {
    return send({
      embeds: [
        new ErrorEmbed(
          `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`,
        ),
      ],
    });
  }

  if (args[0] == "red") {
    args[0] = "r";
  } else if (args[0] == "green") {
    args[0] = "g";
  } else if (args[0] == "black") {
    args[0] = "b";
  }

  const maxBet = await calcMaxBet(message.member);

  const bet = (await formatBet(args[1], message.member).catch(() => {})) || defaultBet;

  if (!bet) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (bet <= 0) {
    return send({
      embeds: [
        new ErrorEmbed(
          `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`,
        ),
      ],
    });
  }

  if (!bet) {
    return send({
      embeds: [
        new ErrorEmbed(
          `${prefix}roulette <colour (**r**ed/**g**reen/**b**lack)> <bet> | ${prefix}**roulette odds** shows the odds of winning`,
        ),
      ],
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

  let colorBet = args[0].toLowerCase();

  let roll = values[Math.floor(Math.random() * values.length)];

  if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, message.author.id)) {
    while (colorBet == roll) {
      roll = shuffle(values)[Math.floor(Math.random() * values.length)];
    }
  }

  let win = false;
  let winnings = 0;
  let multiplier = 0;

  if (colorBet == roll) {
    win = true;
    if (roll == "g") {
      winnings = Math.round(bet * 17);
      multiplier = 17;
    } else {
      winnings = Math.round(bet * 1.5);
      multiplier = 1.5;
    }
  }

  if (colorBet == "b") {
    colorBet = "⚫";
  }
  if (colorBet == "r") {
    colorBet = "🔴";
  }
  if (colorBet == "g") {
    colorBet = "🟢";
  }

  if (roll == "b") {
    roll = "⚫";
  } else if (roll == "r") {
    roll = "🔴";
  } else if (roll == "g") {
    roll = "🟢";
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

    if (roll == "🟢") addProgress(message.author.id, "roulette_pro", 1);
  } else {
    await removeBalance(message.member, bet);
  }

  winnings += bet;

  const embed = new CustomEmbed(
    message.member,
    "*spinning wheel..*\n\n**choice** " + colorBet + "\n**your bet** $" + bet.toLocaleString(),
  ).setHeader("roulette", message.author.avatarURL());

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  send({ embeds: [embed] }).then(async (m) => {
    embed.setDescription(
      "**landed on** " +
        roll +
        "\n\n**choice** " +
        colorBet +
        "\n**your bet** $" +
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
            Math.floor(multi * 100).toString() +
            "**% bonus",
        );
      } else {
        embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString());
      }

      const earnedXp = await calcEarnedGambleXp(message.member, bet, multiplier);

      if (earnedXp > 0) {
        await updateXp(message.member, (await getXp(message.member)) + earnedXp);
        embed.setFooter({ text: `+${earnedXp}xp` });

        const guild = await getGuildName(message.member);

        if (guild) {
          await addToGuildXP(guild, earnedXp, message.member);
        }
      }

      id = await createGame({
        userId: message.author.id,
        bet: bet,
        game: "roulette",
        outcome: `**choice** ${colorBet}\n**landed** ${roll}`,
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
        game: "roulette",
        outcome: `**choice** ${colorBet}\n**landed** ${roll}`,
        result: "lose",
      });
      embed.setFooter({ text: `id: ${id}` });
    }

    gamble(message.author, "roulette", bet, win ? "win" : "lose", id, winnings);

    setTimeout(() => {
      edit({ embeds: [embed] }, m);
    }, 2000);
  });
}

cmd.setRun(run);

module.exports = cmd;
