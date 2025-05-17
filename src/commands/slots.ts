import { randomInt } from "crypto";
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageEditOptions,
  MessageFlags,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
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
import { getBoosters } from "../utils/functions/economy/boosters.js";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds.js";
import { createGame } from "../utils/functions/economy/stats";
import { createUser, formatBet, userExists } from "../utils/functions/economy/utils.js";
import { addXp, calcEarnedGambleXp } from "../utils/functions/economy/xp.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { shuffle } from "../utils/functions/random";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble } from "../utils/logger.js";

const staticEmojis = new Map<string, string>();
const animatedEmojis = new Map<string, string>();

animatedEmojis.set("melon-1", "<a:nypsi_slots:1002211861665681528>");
animatedEmojis.set("melon-2", "<a:nypsi_slots:1002211843919581297>");
animatedEmojis.set("melon-3", "<a:nypsi_slots:1002211850001334393>");
animatedEmojis.set("grape-1", "<a:nypsi_slots:1002211855424557076>");
animatedEmojis.set("grape-2", "<a:nypsi_slots:1002211853088329858>");
animatedEmojis.set("grape-3", "<a:nypsi_slots:1002211862873653289>");
animatedEmojis.set("orange-1", "<a:nypsi_slots:1002211842740998264>");
animatedEmojis.set("orange-2", "<a:nypsi_slots:1002211848789168240>");
animatedEmojis.set("orange-3", "<a:nypsi_slots:1002211859979583488>");
animatedEmojis.set("lemon-1", "<a:nypsi_slots:1002211851293179965>");
animatedEmojis.set("lemon-2", "<a:nypsi_slots:1002211847690264586>");
animatedEmojis.set("lemon-3", "<a:nypsi_slots:1002211845651832944>");
animatedEmojis.set("cherry-1", "<a:nypsi_slots:1002211857832083548>");
animatedEmojis.set("cherry-2", "<a:nypsi_slots:1002211854212407316>");
animatedEmojis.set("cherry-3", "<a:nypsi_slots:1002211856913543288>");

staticEmojis.set("cherry", "<:nypsi_cherry:1002213896821669990>");
staticEmojis.set("lemon", "<:nypsi_lemon:1002213899682189393>");
staticEmojis.set("orange", "<:nypsi_orange:1002213895013941284>");
staticEmojis.set("grape", "<:nypsi_grape:1002213898319057036>");
staticEmojis.set("melon", "<:nypsi_melon:1002213901724831764>");

const multipliers = {
  cherry: 5,
  lemon: 3,
  orange: 2.5,
  grape: 2,
  melon: 1.5,
};

const reels = new Map<number, string[]>();

reels.set(1, [
  "melon-1",
  "melon-1",
  "melon-1",
  "melon-1",
  "melon-1",
  "grape-1",
  "grape-1",
  "grape-1",
  "grape-1",
  "orange-1",
  "orange-1",
  "orange-1",
  "orange-1",
  "lemon-1",
  "lemon-1",
  "cherry-1",
]);

reels.set(2, [
  "melon-2",
  "melon-2",
  "melon-2",
  "melon-2",
  "melon-2",
  "grape-2",
  "grape-2",
  "grape-2",
  "grape-2",
  "grape-2",
  "orange-2",
  "orange-2",
  "orange-2",
  "orange-2",
  "lemon-2",
  "lemon-2",
  "lemon-2",
  "cherry-2",
  "cherry-2",
]);
reels.set(3, [
  "melon-3",
  "melon-3",
  "melon-3",
  "melon-3",
  "melon-3",
  "melon-3",
  "grape-3",
  "grape-3",
  "grape-3",
  "grape-3",
  "grape-3",
  "orange-3",
  "orange-3",
  "orange-3",
  "lemon-3",
  "lemon-3",
  "cherry-3",
  "cherry-3",
]);

const cmd = new Command("slots", "play slots", "money").setAliases(["bet", "slot"]);

cmd.slashEnabled = true;

cmd.slashData.addStringOption((option) =>
  option.setName("bet").setDescription("how much would you like to bet").setRequired(false),
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

  const prefix = (await getPrefix(message.guild))[0];
  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0 && !defaultBet) {
    const embed = new CustomEmbed(message.member)
      .setHeader("slots help")
      .addField("usage", `${prefix}slots <bet>\n${prefix}slots info`)
      .addField(
        "help",
        "[slots has a ~39% winrate](https://github.com/mxz7/nypsi/blob/main/src/commands/slots.ts#279)",
      );
    return send({ embeds: [embed] });
  }

  if (args.length == 1 && args[0] == "info") {
    let txt = "";

    for (const item of Object.keys(multipliers)) {
      txt += `${staticEmojis.get(item)} | ${staticEmojis.get(item)} | ${staticEmojis.get(
        item,
      )} **||** ${
        // @ts-expect-error its weird
        multipliers[item]
      }**x**\n`;
    }

    const embed = new CustomEmbed(message.member).setHeader("win board").setDescription(txt);

    return send({ embeds: [embed] });
  }

  const maxBet = await calcMaxBet(message.member);

  const bet = (await formatBet(args[0], message.member).catch(() => {})) || defaultBet;

  if (!bet) {
    return send({ embeds: [new ErrorEmbed("invalid bet")] });
  }

  if (bet <= 0) {
    return send({
      embeds: [
        new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`),
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

  let one: string;
  let two: string;
  let three: string;

  for (const arr of reels.values()) {
    const shuffled = shuffle(arr);

    if (!one) {
      one = shuffled[randomInt(shuffled.length)];
    } else if (!two) {
      two = shuffled[randomInt(shuffled.length)];
    } else if (!three) {
      three = shuffled[randomInt(shuffled.length)];
    }
  }

  const boosters = await getBoosters(message.member);

  let increasedLuck = false;

  for (const booster of boosters.keys()) {
    if (boosters.get(booster)[0].boosterId == "lucky_7") {
      increasedLuck = true;
      break;
    }
  }

  if (increasedLuck) {
    /**
     * the shit below results in an approximate 60% win rate overtime, resulting in an overall very high gain, without counting multiplier
     */

    if (
      one.split("-")[0] != two.split("-")[0] &&
      two.split("-")[0] != three.split("-")[0] &&
      one.split("-")[0] != three.split("-")[0]
    ) {
      const chance = Math.floor(Math.random() * 6);
      const chanceScore = 4;
      const chanceScore2 = 3;

      if (chance < chanceScore) {
        one = two.split("-")[0] + "-1";
      } else if (chance < chanceScore2) {
        three = two.split("-")[0] + "-3";
      }
    }

    if (two.split("-")[0] == three.split("-")[0] && one.split("-")[0] != two.split("-")[0]) {
      const chance = Math.floor(Math.random() * 12);
      const chanceScore = 7;

      if (chance < chanceScore) {
        one = two.split("-")[0] + "-1";
      }
    }

    if (one.split("-")[0] == two.split("-")[0] && one.split("-")[0] != three.split("-")[0]) {
      const chance = Math.floor(Math.random() * 12);
      const chanceScore = 6;

      if (chance < chanceScore) {
        three = two.split("-")[0] + "-3";
      }
    }
  } else {
    /**
     * the shit below results in an approximate 39% win rate overtime, resulting in an overall loss, without counting multiplier
     */

    if (
      one.split("-")[0] != two.split("-")[0] &&
      two.split("-")[0] != three.split("-")[0] &&
      one.split("-")[0] != three.split("-")[0]
    ) {
      const chance = Math.floor(Math.random() * 41);
      const chanceScore = 4;
      const chanceScore2 = 8;

      if (chance < chanceScore) {
        one = two.split("-")[0] + "-1";
      } else if (chance < chanceScore2) {
        three = two.split("-")[0] + "-3";
      }
    }

    if (two.split("-")[0] == three.split("-")[0] && one.split("-")[0] != two.split("-")[0]) {
      const chance = Math.floor(Math.random() * 12);
      const chanceScore = 7;

      if (chance < chanceScore) {
        one = two.split("-")[0] + "-1";
      }
    }

    if (one.split("-")[0] == two.split("-")[0] && one.split("-")[0] != three.split("-")[0]) {
      const chance = Math.floor(Math.random() * 12);
      const chanceScore = 6;

      if (chance < chanceScore) {
        three = two.split("-")[0] + "-3";
      }
    }
  }

  if (await redis.sismember(Constants.redis.nypsi.FORCE_LOSE, message.author.id)) {
    while (one.substring(0, one.length - 2) == two.substring(0, two.length - 2)) {
      const reel = reels.get(2);
      two = reel[randomInt(reel.length)];
    }
  }

  let win = false;
  let winnings = 0;
  let multiplier = 0;

  if (one.split("-")[0] == two.split("-")[0] && two.split("-")[0] == three.split("-")[0]) {
    // @ts-expect-error uhh its weird
    multiplier = multipliers[one.split("-")[0]];

    win = true;
    winnings = Math.round(multiplier * bet);

    if (one.split("-")[0] == "cherry") addProgress(message.author.id, "slots_pro", 1);
  } else if (one.split("-")[0] == two.split("-")[0]) {
    win = true;
    winnings = Math.round(bet * 1.2);
    multiplier = 1.2;
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
    "~~------------~~\n" +
      animatedEmojis.get(one) +
      " **|** " +
      animatedEmojis.get(two) +
      " **|** " +
      animatedEmojis.get(three) +
      "\n~~------------~~\n**bet** $" +
      bet.toLocaleString(),
  ).setHeader("slots", message.author.avatarURL());

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data as InteractionEditReplyOptions);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  send({ embeds: [embed] }).then(async (m) => {
    embed.setDescription(
      "~~------------~~\n" +
        staticEmojis.get(one.split("-")[0]) +
        " **|** " +
        staticEmojis.get(two.split("-")[0]) +
        " **|** " +
        staticEmojis.get(three.split("-")[0]) +
        "\n~~------------~~\n**bet** $" +
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
        game: "slots",
        outcome:
          staticEmojis.get(one.split("-")[0]) +
          " **|** " +
          staticEmojis.get(two.split("-")[0]) +
          " **|** " +
          staticEmojis.get(three.split("-")[0]),
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
        game: "slots",
        outcome:
          staticEmojis.get(one.split("-")[0]) +
          " **|** " +
          staticEmojis.get(two.split("-")[0]) +
          " **|** " +
          staticEmojis.get(three.split("-")[0]),
        result: "lose",
      });
      embed.setFooter({ text: `id: ${id}` });
    }

    gamble(message.author, "slots", bet, win ? "win" : "lose", id, winnings);
    setTimeout(() => {
      edit({ embeds: [embed] }, m);
    }, 2250);
  });
}

cmd.setRun(run);

module.exports = cmd;
