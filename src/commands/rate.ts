import { CommandInteraction, GuildMember, Message, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { addBalance } from "../utils/functions/economy/balance";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addXp } from "../utils/functions/economy/xp";
import { getMember } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const assCache = new Map<string, { content: string; emoji: string }>();

const assValues = [
  { content: "flat as a pancake.", emoji: "🥞" },
  { content: "HOLLYYYYYY LAY THAT THING ON MY FACE RIGHT NOW", emoji: "🍑" },
  { content: "i bet it jiggles", emoji: "🍑" },
  { content: "can i spank it?", emoji: "🍑👋" },
  { content: "dump truck", emoji: "🍑" },
  { content: "damn you're an ironing board", emoji: "😹🫵" },
  { content: "volumptuous", emoji: "🍑" },
  { content: "I WANNA EAT IT", emoji: "🍑😋" },
  { content: "let me bite.", emoji: "🍑🤤" },
  { content: "hahahahhahha there's nothing there", emoji: "😹🫵" },
];

const boobCache = new Map<string, { msg: string; emoji: string }>();

const furryCache = new Map<string, number>();

const gayCache = new Map<string, number>();

const heightCache = new Map<string, string>();

const hornyCache = new Map<string, number>();

const hotCache = new Map<string, number>();

const iqCache = new Map<string, number>();

const ppCache = new Map<string, number>();

const slutCache = new Map<string, number>();

const ratings = {
  ass: {
    description: "accurate prediction of your ass size",
    aliases: ["ass", "butt", "bum", "booty"],
    cooldown: 3,
    run: runAss,
  },
  boob: {
    description: "accurate prediction of your boob size",
    aliases: ["boob", "howbigaremyboobies"],
    cooldown: 5,
    run: runBoob,
  },
  furry: {
    description: "measure how much of a furry you are",
    aliases: ["furry", "howfurry", "stfufurry"],
    cooldown: 3,
    run: runFurry,
  },
  gay: {
    description: "very accurate gay level calculator",
    aliases: ["gay", "howgay", "lgbtdetector"],
    cooldown: 3,
    run: runGay,
  },
  height: {
    description: "accurate prediction of your height",
    aliases: ["height"],
    cooldown: 3,
    run: runHeight,
  },
  horny: {
    description: "measure how horny you are",
    aliases: ["horny", "howhorny", "fuckmedaddy", "makemecum"],
    cooldown: 3,
    run: runHorny,
  },
  hot: {
    description: "measure how hot you are",
    aliases: ["hot", "howhot", "sexy"],
    cooldown: 3,
    run: runHot,
  },
  iq: { description: "accurate prediction of your iq", aliases: ["iq"], cooldown: 3, run: runIq },
  pp: {
    description: "accurate prediction of your pp size",
    aliases: ["pp", "penis", "12inchmonster", "1inchwarrior"],
    cooldown: 3,
    run: runPp,
  },
  slut: {
    description: "measure how much of a slut you are",
    aliases: ["slut", "howslut", "whore", "cumslut"],
    cooldown: 5,
    run: runSlut,
  },
};

const cmd = new Command(
  "rate",
  "get a random rating for yourself or another user",
  "fun",
).setShorthands(
  Object.fromEntries(
    Object.entries(ratings).flatMap(([rating, data]) =>
      data.aliases.map((alias) => [alias, `rate ${rating}`]),
    ),
  ),
);

cmd.slashEnabled = true;

for (const [rating, data] of Object.entries(ratings)) {
  cmd.slashData.addSubcommand((sub) =>
    sub
      .setName(rating)
      .setDescription(data.description)
      .addUserOption((option) =>
        option.setName("user").setDescription("user to rate (defaults to you)"),
      ),
  );
}

cmd.setRun(async (message, send, args) => {
  let rating = args[0]?.toLowerCase();
  let search = args.slice(1).join(" ");

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    rating = message.options.getSubcommand();
    const user = message.options.getUser("user");
    search = user ? `<@${user.id}>` : "";
  }

  if (!rating || !Object.hasOwn(ratings, rating)) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          Object.keys(ratings)
            .map((name) => `/rate ${name}`)
            .join("\n"),
        ).setHeader("ratings"),
      ],
    });
  }

  const selected = ratings[rating as keyof typeof ratings];

  if (await onCooldown(rating, message.member)) {
    const res = await getResponse(rating, message.member);
    if (res.respond) return send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const member = search ? await getMember(message.guild, search) : message.member;

  if (!member)
    return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });

  await addCooldown(rating, message.member, selected.cooldown);
  return selected.run(message, send, member);
});

async function runAss(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let value: { content: string; emoji: string };

  if (assCache.has(member.user.id)) {
    value = assCache.get(member.user.id);
  } else {
    value = assValues[Math.floor(Math.random() * assValues.length)];
    assCache.set(member.user.id, value);

    setTimeout(() => {
      assCache.delete(member.user.id);
    }, 60 * 1000);
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("ass determiner", member.user.avatarURL())
    .setDescription(member.user.toString() + `\n${value.emoji} ${value.content}`);

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runBoob(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  const letters = ["AA", "A", "B", "C", "D", "DD"];

  let sizeMsg = "";
  let sizeEmoji = "";

  if (boobCache.has(member.user.id)) {
    sizeMsg = boobCache.get(member.user.id).msg;
    sizeEmoji = boobCache.get(member.user.id).emoji;
  } else {
    const size = Math.floor(Math.random() * 9) * 2 + 30;

    const index = Math.floor(Math.random() * letters.length);

    const letter = letters[index];

    if (index > 4) {
      sizeEmoji = "🍈";
    } else if (index > 2) {
      sizeEmoji = "🍒";
    } else {
      sizeEmoji = "🥞";
    }

    sizeMsg = `${size}${letter}`;

    boobCache.set(member.user.id, {
      msg: sizeMsg,
      emoji: sizeEmoji,
    });

    setTimeout(() => {
      boobCache.delete(member.user.id);
    }, 60 * 1000);
  }

  const embed = new CustomEmbed(message.member)
    .setHeader("boob calculator", member.user.avatarURL())
    .setDescription(member.user.toString() + `\n${sizeMsg}\n${sizeEmoji}`);

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runFurry(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  if (!(await userExists(member))) await createUser(member);

  let furryAmount;

  if (furryCache.has(member.user.id)) {
    furryAmount = furryCache.get(member.user.id);
  } else {
    furryAmount = Math.ceil(Math.random() * 101) - 1;

    furryCache.set(member.user.id, furryAmount);

    setTimeout(() => {
      if (furryCache.has(member.user.id)) {
        furryCache.delete(member.user.id);
      }
    }, 60 * 1000);
  }

  let furryText = "";
  let furryEmoji = "";

  if (furryAmount >= 85) {
    furryEmoji = "🐶🍆💦🧎‍♂️😋";
    furryText = "fucking cumfurry bet u work at a doggy daycare";
  } else if (furryAmount >= 70) {
    furryEmoji = "🐱🍆💦💦";
    furryText = "you've got a furry suit collection and go to cosplay conventions";
  } else if (furryAmount >= 50) {
    furryEmoji = "👉🐈💦";
    furryText = "stop looking at the cat";
  } else if (furryAmount >= 30) {
    furryEmoji = "💻🐕🐩";
    furryText = "i've seen your search history...";
  } else if (furryAmount >= 25) {
    furryEmoji = "😾";
    furryText = "STOP DONT DO IT DONT BUY THE FURRY SUIT";
  } else if (furryAmount >= 15) {
    furryEmoji = "🐈🐕";
    furryText = "you be thinking about the wrong things";
  } else if (furryAmount >= 7) {
    furryEmoji = "👍⁉";
    furryText = "you're normal. i hope.";
  } else {
    furryEmoji = "👍";
    furryText = "you're normal, thank you. have 1 xp";

    if (furryCache.has(member.user.id)) {
      furryCache.delete(member.user.id);
      await addXp(member, 1);
    }
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${furryAmount}**% furry ${furryEmoji}\n${furryText}`,
  ).setHeader("furry detector 5000", member.user.avatarURL());

  if (furryAmount < 7) {
    embed.setFooter({ text: "+1xp" });
  }

  await send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runGay(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let gayAmount;

  if (gayCache.has(member.user.id)) {
    gayAmount = gayCache.get(member.user.id);
  } else {
    gayAmount = Math.ceil(Math.random() * 101) - 1;

    gayCache.set(member.user.id, gayAmount);

    setTimeout(() => {
      gayCache.delete(member.user.id);
    }, 60 * 1000);
  }

  let gayText = "";
  let gayEmoji = "";

  if (gayAmount >= 70) {
    gayEmoji = ":rainbow_flag:";
    gayText = "dam hmu 😏";
  } else if (gayAmount >= 45) {
    gayEmoji = "🌈";
    gayText = "good enough 😉";
  } else if (gayAmount >= 20) {
    gayEmoji = "👫";
    gayText = "kinda straight 😐";
  } else {
    gayEmoji = "📏";
    gayText = "thought we coulda had smth 🙄";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${gayAmount}**% gay ${gayEmoji}\n${gayText}`,
  ).setHeader("gay calculator", member.user.avatarURL());

  await send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runHeight(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let size;
  let feet;
  let inches;
  let sizeMsg;

  if (heightCache.has(member.user.id)) {
    size = heightCache.get(member.user.id);
    feet = size.split("'")[0];
    inches = parseInt(size.split("'")[1]);
  } else {
    feet = Math.floor(Math.random() * 6) + 4;
    inches = Math.floor(Math.random() * 12);

    if (feet > 6) feet = 5;

    size = `${feet}'${inches}`;

    heightCache.set(member.user.id, size);

    setTimeout(() => {
      heightCache.delete(member.user.id);
    }, 60 * 1000);
  }

  if (feet == 6) {
    sizeMsg = "yo ur tall 😳";
  } else if (feet == 5) {
    if (inches <= 6) {
      sizeMsg = "kinda short.. 🤨";
    } else {
      sizeMsg = "average 🙄";
    }
  } else {
    sizeMsg = "LOOOL UR TINY LMAO 😂🤣😆 IMAGINE";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n\n📏 ${size}\n${sizeMsg}`,
  ).setHeader("short person calculator", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runHorny(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let hornyAmount;

  if (hornyCache.has(member.user.id)) {
    hornyAmount = hornyCache.get(member.user.id);
  } else {
    hornyAmount = Math.ceil(Math.random() * 101) - 1;

    hornyCache.set(member.user.id, hornyAmount);

    setTimeout(() => {
      hornyCache.delete(member.user.id);
    }, 60 * 1000);
  }

  let hornyText = "";
  let hornyEmoji = "";

  if (hornyAmount >= 95) {
    hornyEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
    hornyText = "FUCK ME NOW. DADDY.";
  } else if (hornyAmount >= 80) {
    hornyEmoji = "🍆💦🤤";
    hornyText = "hey let me help you pleaseeee";
  } else if (hornyAmount >= 60) {
    hornyEmoji = "🍆✊ 😼👈";
    hornyText = "hehe u kinda turning me on";
  } else if (hornyAmount >= 45) {
    hornyEmoji = "😏🍆";
    hornyText = "i see your incognito tab";
  } else if (hornyAmount >= 35) {
    hornyEmoji = "👉👌";
    hornyText = "dirty thoughts";
  } else if (hornyAmount >= 25) {
    hornyEmoji = "🍆";
    hornyText = "hehe u can do better than that";
  } else if (hornyAmount >= 15) {
    hornyEmoji = "😐";
    hornyText = "cum on man.";
  } else {
    hornyEmoji = "🙄";
    hornyText = "ur so innocent. boring.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${hornyAmount}**% horny ${hornyEmoji}\n${hornyText}`,
  ).setHeader("horny calculator", member.user.avatarURL());

  await send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runHot(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  if (!(await userExists(member))) await createUser(member);

  let hotAmount;

  if (hotCache.has(member.user.id)) {
    hotAmount = hotCache.get(member.user.id);
  } else {
    hotAmount = Math.ceil(Math.random() * 101) - 1;

    hotCache.set(member.user.id, hotAmount);

    setTimeout(() => {
      hotCache.delete(member.user.id);
    }, 60 * 1000);
  }

  let hotText = "";
  let hotEmoji = "";

  if (hotAmount >= 95) {
    hotEmoji = "💰🍆💪😍😘";
    hotText =
      "HEY THERE what does it take to marry you. look. ill give you money. here. ive got big muscles too. i'm 6'2. please.";

    if (hotCache.has(member.user.id)) {
      hotCache.delete(member.user.id);
      await addBalance(member, 1069);
      addStat(member, "earned-hot", 1069);
    }
  } else if (hotAmount >= 80) {
    hotEmoji = "💍😍";
    hotText = "marry me wifey";
  } else if (hotAmount >= 60) {
    hotEmoji = "😳😏🥺";
    hotText = "hey there baby girl.. ahaha...";
  } else if (hotAmount >= 45) {
    hotEmoji = "😳😳🥺";
    hotText = "hey hey dam u kinda cute";
  } else if (hotAmount >= 35) {
    hotEmoji = "🥵";
    hotText = "whats ur sc";
  } else if (hotAmount >= 25) {
    hotEmoji = "🍆";
    hotText = "fuckable";
  } else if (hotAmount >= 15) {
    hotEmoji = "🤓";
    hotText = "nerd.";
  } else {
    hotEmoji = "🙄";
    hotText = "ugly.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${hotAmount}**% hot ${hotEmoji}\n${hotText}`,
  ).setHeader("hotness calculator", member.user.avatarURL());

  if (hotAmount >= 95) {
    embed.setFooter({ text: "+$1,069" });
  }

  await send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runIq(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let iq;
  let iqMsg;

  if (iqCache.has(member.user.id)) {
    iq = iqCache.get(member.user.id);
  } else {
    let chanceAmount = 25;

    if (await isPremium(member)) {
      if ((await getTier(member)) >= 3) {
        chanceAmount = 10;
      }
    }

    const chance = Math.floor(Math.random() * chanceAmount);

    if (chance == 7) {
      const chance2 = Math.floor(Math.random() * 10);

      if (chance2 > 5) {
        iq = Math.floor(Math.random() * 20);
      } else {
        iq = (Math.floor(Math.random() * 8) + 2) * 100;
      }
    } else if (chance == 6) {
      iq = 69;
    } else if (chance == 5) {
      iq = 420;
    } else {
      iq = Math.floor(Math.random() * 40) + 80;
    }

    iqCache.set(member.user.id, iq);

    setTimeout(() => {
      iqCache.delete(member.user.id);
    }, 60 * 1000);
  }

  if (iq == 69) {
    iqMsg = "😉😏🍆🍑";
  } else if (iq < 80) {
    iqMsg = "you're a rock :rock:";
  } else if (iq < 90) {
    iqMsg = "u probably push doors that say pull";
  } else if (iq < 98) {
    iqMsg = "dumbass.. 🤣";
  } else if (iq < 103) {
    iqMsg = "average 🙄";
  } else if (iq < 120) {
    iqMsg = "big brain";
  } else if (iq < 400) {
    iqMsg = "nerd 🤓";
  } else if (iq == 420) {
    iqMsg = "🚬🍁🍂";
  } else {
    iqMsg = "uh. woah.";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n\n**${iq}** IQ 🧠\n${iqMsg}`,
  ).setHeader("iq calculator", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);
}

async function runPp(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let size;
  let sizeMsg = "8";

  if (ppCache.has(member.user.id)) {
    size = ppCache.get(member.user.id);
  } else {
    size = Math.floor(Math.random() * 15);

    let chance = 45;

    if (await isPremium(member)) {
      if ((await getTier(member)) >= 3) {
        chance = 10;
      }
    }

    const bigInch = Math.floor(Math.random() * chance);

    if (bigInch == 7) {
      size = Math.floor(Math.random() * 55) + 15;
    }

    ppCache.set(member.user.id, size);

    setTimeout(() => {
      ppCache.delete(member.user.id);
    }, 60 * 1000);
  }

  const boosters = await getBoosters(message.member);

  for (const boosterId of boosters.keys()) {
    if (getItems()[boosterId].boosterEffect.boosts.includes("pp")) {
      size *= getItems()[boosterId].boosterEffect.effect;
    }
  }

  for (let i = 0; i < size; i++) {
    sizeMsg = sizeMsg + "=";
  }

  sizeMsg = sizeMsg + "D";

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n${sizeMsg}\n📏 ${size} ${pluralize("inch", size, "inches")}`,
  ).setHeader("pp predictor 1337", member.user.avatarURL());

  send({ embeds: [embed] });

  addProgress(message.member, "unsure", 1);

  if (size < 5 && member.user.id === message.author.id) {
    addTaskProgress(message.member, "pp_small");
  } else if (size > 6 && member.user.id === message.author.id) {
    addTaskProgress(message.member, "pp_big");
  } else if (member.user.id === message.author.id) {
    addTaskProgress(message.member, "pp");
  }
}

async function runSlut(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  member: GuildMember,
) {
  let slutAmount;

  if (slutCache.has(member.user.id)) {
    slutAmount = slutCache.get(member.user.id);
  } else {
    slutAmount = Math.ceil(Math.random() * 101) - 1;

    slutCache.set(member.user.id, slutAmount);

    setTimeout(() => {
      slutCache.delete(member.user.id);
    }, 60 * 1000);
  }

  let slutText = "";
  let slutEmoji = "";

  if (slutAmount >= 95) {
    slutEmoji = "🍆💦🍒🍑😈😉😏 🍆💦😜";
    slutText = "whore ass hooker cumslut cousin fucker sweet home alabama";
  } else if (slutAmount >= 80) {
    slutEmoji = "🍆🍒🍑😈 👉👌";
    slutText = "pornhub and onlyfans is your family business";
  } else if (slutAmount >= 60) {
    slutEmoji = "🍆👉👌💦";
    slutText = "took 12 loads in one sitting";
  } else if (slutAmount >= 45) {
    slutEmoji = "👉👌💦";
    slutText = "princess cumslut";
  } else if (slutAmount >= 35) {
    slutEmoji = "🍆✊";
    slutText = "you would fuck anyone";
  } else if (slutAmount >= 25) {
    slutEmoji = "🍆🧎‍♂️";
    slutText = "still a whore";
  } else if (slutAmount >= 15) {
    slutEmoji = "🍑";
    slutText = "average 🙄";
  } else {
    slutEmoji = "🤐";
    slutText = "virgin";
  }

  const embed = new CustomEmbed(
    message.member,
    `${member.user.toString()}\n**${slutAmount}**% slut ${slutEmoji}\n${slutText}`,
  ).setTitle("slut calculator");

  addProgress(message.member, "unsure", 1);

  return await send({ embeds: [embed] });
}
module.exports = cmd;
