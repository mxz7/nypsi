import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { createGame, getGambleStats } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("fight", "challenge another member to a fight", "fun");

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) =>
  option.setName("member").setDescription("member you want to fight").setRequired(true)
);

const waiting = new Set<string>();
const cookieRecent = new Set<string>();
const gifs = [
  "https://c.tenor.com/p_cxPj2oRq0AAAAC/ksi-ksi-box.gif",
  "https://c.tenor.com/SgWHHMfm7uUAAAAC/salt-saltpapi.gif",
  "https://c.tenor.com/JmQOPxjJ6yYAAAAC/weji-deji.gif",
  "https://c.tenor.com/EkWAL6XhODIAAAAC/deji-boxing-deji.gif",
  "https://c.tenor.com/OHZwNy6nr5IAAAAC/conor-mcgregor-ufc.gif",
];

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

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

  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member).setHeader("fight", message.author.avatarURL());

    embed.setDescription(`${prefix}**fight <member>** *challenge another member to a fight*`);

    const stats = (await getGambleStats(message.member)).find((s) => s.game == "fight");

    if (stats) {
      embed.setFooter({ text: `you are ${stats._sum.win}-${stats._count._all - stats._sum.win}` });
    }

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "stats" || args[0].toLowerCase() == "stat") {
    const stats = (await getGambleStats(message.member)).find((s) => s.game == "fight");

    if (!stats) {
      return send({ embeds: [new ErrorEmbed("you have no fight stats")] });
    }

    const embed = new CustomEmbed(
      message.member,
      `you have won **${stats._sum.win.toLocaleString()}** fights and lost **${(
        stats._count._all - stats._sum.win
      ).toLocaleString()}**`
    ).setHeader("your fight stats", message.author.avatarURL());

    return send({ embeds: [embed] });
  }

  if (waiting.has(message.author.id)) {
    return send({
      embeds: [new ErrorEmbed("please wait until your game has been accepted or denied")],
    });
  }

  let target: GuildMember;

  if (!message.mentions.members.first()) {
    target = await getMember(message.guild, args.join(" "));
  } else {
    target = message.mentions.members.first();
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.id == message.author.id) {
    return send({
      embeds: [
        new ErrorEmbed("imbecile").setImage(
          "https://media1.giphy.com/media/fjmH5BSfkHvVOkvRBs/giphy.gif?cid=790b7611184b72eeb610acf9c41e0f6a25c42f6e987583f6&rid=giphy.gif&ct=g"
        ),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 60);

  waiting.add(message.author.id);

  const embed = new CustomEmbed(message.member).setHeader("fight invitation", message.author.avatarURL());

  embed.setDescription(`${message.author.tag} has challenged you to a fight. do you accept?`);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger)
  );

  const m = await send({
    embeds: [embed],
    components: [row],
    content: `${target.user.toString()} you have been challenged to a fight`,
  });

  const filter = (i: Interaction) => i.user.id == target.id;
  let fail = false;

  const response = await m
    .awaitMessageComponent({ filter, time: 60000 })
    .then(async (collected) => {
      await collected.deferUpdate().catch();
      waiting.delete(message.author.id);
      return collected.customId;
    })
    .catch(async () => {
      fail = true;
      waiting.delete(message.author.id);
      return message.channel.send({ content: message.author.toString() + " fight request expired" });
    });

  if (fail) return;

  if (typeof response != "string") return;

  if (response != "y") {
    embed.setDescription("fight request denied");
    return await m.edit({ embeds: [embed], components: [] });
  }

  await m.delete();

  if (!(await userExists(message.member))) await createUser(message.member);
  if (!(await userExists(target))) await createUser(target);

  const countdownEmbed = new CustomEmbed(message.member).setHeader(`${message.author.username} vs ${target.user.username}`);

  countdownEmbed.setDescription("fight starting in 3 seconds...");

  const msg = await message.channel.send({ embeds: [countdownEmbed] });

  await wait(2);

  countdownEmbed.setDescription("fight starting in 2 seconds...");

  await msg.edit({ embeds: [countdownEmbed] });

  await wait(2);

  countdownEmbed.setDescription("fight starting in 1 second...");

  await msg.edit({ embeds: [countdownEmbed] });

  await wait(2);

  const fightRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("at").setLabel("attack").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("he").setLabel("heal").setStyle(ButtonStyle.Success)
  );

  const homeBoosters = await getBoosters(message.member);
  const awayBoosters = await getBoosters(target);

  let homeStrength = false;

  for (const booster of Array.from(homeBoosters.keys())) {
    if (homeBoosters.get(booster)[0].boosterId == "steroids") {
      homeStrength = true;
      break;
    }
  }

  let awayStrength = false;

  for (const booster of Array.from(awayBoosters.keys())) {
    if (awayBoosters.get(booster)[0].boosterId == "steroids") {
      awayStrength = true;
      break;
    }
  }

  const fight = new Fight(message.member, target, homeStrength, awayStrength);

  const fightEmbed = fight.renderEmbed();

  await msg.edit({ embeds: [fightEmbed], components: [fightRow] });

  const fightMessageFilter = (interaction: Interaction) =>
    interaction.user.id == message.author.id || interaction.user.id == target.user.id;

  const collector = msg.createMessageComponentCollector({ filter: fightMessageFilter });

  let lastUpdate = Date.now();

  let ended = false;

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    if (ended) return;

    if (i.customId == "at") {
      if (ended) return;
      if (i.user.id == message.author.id) {
        fight.homeHit();
      } else {
        fight.awayHit();
      }
    } else {
      if (ended) return;
      if (i.user.id == message.author.id) {
        const res = fight.homeHeal();

        if (!res) {
          await i.followUp({
            embeds: [new CustomEmbed(message.member, "you have no more heals left")],
            ephemeral: true,
          });
        }
      } else {
        if (ended) return;
        const res = fight.awayHeal();

        if (!res) {
          await i.followUp({ embeds: [new CustomEmbed(target, "you have no more heals left")], ephemeral: true });
        }
      }
    }

    const health = fight.getHealth();

    if (health.home <= 0 || health.away <= 0) {
      if (ended) return;
      ended = true;
      const embed = await fight.end();

      embed.setImage(gifs[Math.floor(Math.random() * gifs.length)]);

      await msg.edit({ embeds: [embed], components: [] });
      collector.stop();
      return;
    }

    if (lastUpdate < Date.now() - 1000) {
      lastUpdate = Date.now();
      const embed = fight.renderEmbed();
      if (ended) return;

      embed.disableFooter();

      await msg.edit({ embeds: [embed] });
      return;
    }
  });
}

cmd.setRun(run);

module.exports = cmd;

class Fight {
  private person1: FightCharacter;
  private person1Strength: boolean;
  private person2: FightCharacter;
  private person2Strength: boolean;
  private log: string[];
  private logCount: number;

  private home: GuildMember;
  private away: GuildMember;

  constructor(home: GuildMember, away: GuildMember, homeStrength: boolean, awayStrength: boolean) {
    this.person1 = new FightCharacter(homeStrength);
    this.person2 = new FightCharacter(awayStrength);

    this.home = home;
    this.away = away;

    this.log = [];
    this.logCount = 0;
  }

  public homeHit() {
    const damage = this.person1.hit();

    if (!damage) return;

    this.person2.takeHit(damage);

    this.updateLog(`${this.home.user.username} hits ${this.away.user.username} for ${damage}hp`);
  }

  public homeHeal() {
    if (this.person1.heals <= 0) {
      return false;
    }
    const r = this.person1.heal();

    if (r) {
      this.updateLog(`${this.home.user.username} heals 25hp`);
    }

    return true;
  }

  public awayHit() {
    const damage = this.person2.hit();

    if (!damage) return;

    this.person1.takeHit(damage);

    this.updateLog(`${this.away.user.username} hits ${this.home.user.username} for ${damage}hp`);
  }

  public awayHeal() {
    if (this.person2.heals <= 0) {
      return false;
    }
    const r = this.person2.heal();

    if (r) {
      this.updateLog(`${this.away.user.username} heals 25hp`);
    }
    return true;
  }

  private updateLog(text: string) {
    this.logCount++;
    this.log.push(`${this.logCount}. ${text}`);

    if (this.log.length >= 5) {
      this.log.shift();
    }
  }

  public renderEmbed() {
    const embed = new CustomEmbed(this.home);

    embed.setHeader(`${this.home.user.username} vs ${this.away.user.username}`);

    if (this.log.length > 0) {
      embed.setDescription(`\`\`\`${this.log.join("\n")}\`\`\``);
    }

    embed.addField(this.home.user.username, `health: **${this.person1.health}**hp\nheals left: **${this.person1.heals}**/3`);
    embed.addField(this.away.user.username, `health: **${this.person2.health}**hp\nheals left: **${this.person2.heals}**/3`);

    return embed;
  }

  public async end() {
    const embed = new CustomEmbed(this.home);

    const winner: { member: GuildMember; stats: FightCharacter } = {
      member: undefined,
      stats: undefined,
    };

    let loser: GuildMember;

    if (this.person1.health <= 0) {
      winner.member = this.away;
      winner.stats = this.person2;

      loser = this.home;

      this.updateLog(`${loser.user.username} died`);
    }
    if (this.person2.health <= 0) {
      winner.member = this.home;
      winner.stats = this.person1;

      loser = this.away;

      this.updateLog(`${loser.user.username} died`);
    }

    if (await userExists(winner.member.user.id)) {
      addProgress(winner.member.user.id, "fighter", 1);
      if (!cookieRecent.has(winner.member.user.id)) {
        cookieRecent.add(winner.member.user.id);

        await addInventoryItem(winner.member, "cookie", 1);

        embed.setFooter({ text: "well done. enjoy this cookie 🍪" });
      }
    }

    if (await userExists(this.home.user.id)) {
      await createGame({
        userId: this.home.user.id,
        bet: 0,
        game: "fight",
        win: this.home.user.id == winner.member.user.id,
        outcome: `\`\`\`${this.log.join("\n")}\`\`\``,
      });
    }

    embed.setHeader(`${this.home.user.username} vs ${this.away.user.username}`);
    embed.setDescription(
      `\`\`\`${this.log.join("\n")}\`\`\`\n\n**${winner.member.user.username} has won this fight**\ndamage given: ${
        winner.stats.damageGiven
      }hp\ndamage received: ${winner.stats.damageReceived}hp`
    );

    return embed;
  }

  public getHealth() {
    return { home: this.person1.health, away: this.person2.health };
  }
}

class FightCharacter {
  public health: number;
  public heals: number;
  public damageGiven: number;
  public damageReceived: number;

  private lastHit: number;
  private lastHeal: number;
  private strength: boolean;

  constructor(strength: boolean) {
    this.health = 100;
    this.heals = 3;
    this.damageGiven = 0;
    this.damageReceived = 0;
    this.lastHit = Date.now();
    this.lastHeal = Date.now();
    this.strength = strength;
  }

  public hit() {
    if (this.lastHit > Date.now() - 350) return null;

    let damage = Math.floor(Math.random() * 10) + 3;

    if (this.strength) damage += Math.floor(damage * 0.5);

    this.damageGiven += damage;

    this.lastHit = Date.now();

    return damage;
  }

  public takeHit(damage: number) {
    this.damageReceived += damage;
    this.health -= damage;
  }

  public heal() {
    if (this.lastHeal > Date.now() - 350) return false;
    this.heals -= 1;

    this.health += 25;

    if (this.health > 100) this.health = 100;

    this.lastHeal = Date.now();
    return true;
  }
}

async function wait(seconds: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0);
    }, seconds * 1000);
  });
}

setInterval(() => {
  cookieRecent.clear();
}, ms("30m"));
