import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  User,
} from "discord.js";
import * as fs from "fs/promises";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { b, c } from "../utils/functions/anticheat";
import { updateBalance, updateBankBalance } from "../utils/functions/economy/balance";
import { setInventoryItem } from "../utils/functions/economy/inventory";
import { setPrestige } from "../utils/functions/economy/prestige";
import { getItems, isEcoBanned, setEcoBan } from "../utils/functions/economy/utils";
import { updateXp } from "../utils/functions/economy/xp";
import { addKarma, getKarma, removeKarma } from "../utils/functions/karma/karma";
import { getUserAliases } from "../utils/functions/premium/aliases";
import { addMember, getPremiumProfile, isPremium, setExpireDate, setTier } from "../utils/functions/premium/premium";
import { getAdminLevel, setAdminLevel } from "../utils/functions/users/admin";
import { isUserBlacklisted, setUserBlacklist } from "../utils/functions/users/blacklist";
import { getCommandUses } from "../utils/functions/users/commands";
import { hasProfile } from "../utils/functions/users/utils";
import { logger } from "../utils/logger";

const cmd = new Command("x", "admincmd", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(message instanceof Message)) return;
  if ((await getAdminLevel(message.author.id)) < 1) return message.react("🫦");

  const getDbData = async (user: User) => {
    logger.info(`fetching data for ${user.id}...`);
    const userData = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      include: {
        Economy: {
          include: {
            EconomyGuild: true,
            EconomyGuildMember: true,
            Auction: true,
            BakeryUpgrade: true,
            Inventory: true,
            Boosters: true,
            Game: true,
            ItemUse: true,
            Crafting: true,
            LotteryTicket: true,
            EconomyWorker: {
              include: {
                upgrades: true,
              },
            },
          },
        },
        Premium: {
          include: {
            PremiumCommand: true,
          },
        },
        Username: true,
        WordleStats: true,
        CommandUse: true,
        Achievements: true,
        DMSettings: true,
        Preferences: true,
      },
    });

    const moderationCases = await prisma.moderationCase.findMany({
      where: {
        user: user.id,
      },
    });

    const moderationCasesModerator = await prisma.moderationCase
      .findMany({
        where: {
          moderator: user?.tag,
        },
      })
      .catch(() => {});

    const moderationMutes = await prisma.moderationMute.findMany({
      where: {
        userId: user.id,
      },
    });

    const moderationBans = await prisma.moderationBan.findMany({
      where: {
        userId: user.id,
      },
    });

    const chatReactionStats = await prisma.chatReactionStats.findMany({
      where: {
        userId: user.id,
      },
    });

    const file = `/tmp/nypsi_data_${user.id}.txt`;

    logger.info(`packing into text file for ${user.id}...`);

    await fs.writeFile(
      file,
      `nypsi data for ${user?.username}#${user?.discriminator} (${user?.id}) requested by ${message.author.tag} ${
        message.author.id
      } - ${new Date().toUTCString()}\n\n----------\nYOUR USER DATA\n----------\n\n`
    );
    await fs.appendFile(file, JSON.stringify(userData, null, 2));

    await fs.appendFile(
      file,
      "\n----------------------------------------------\n\n----------\nYOUR MODERATION CASE DATA WHERE YOU GOT PUNISHED\n----------\n\n"
    );
    await fs.appendFile(file, JSON.stringify(moderationCases, null, 2));

    await fs.appendFile(
      file,
      "\n----------------------------------------------\n\n----------\nYOUR MODERATION CASE DATA WHERE YOU WERE THE MODERATOR\n----------\n\n"
    );
    await fs.appendFile(file, JSON.stringify(moderationCasesModerator, null, 2));

    await fs.appendFile(
      file,
      "\n----------------------------------------------\n\n----------\nYOUR MODERATION MUTE DATA\n----------\n\n"
    );
    await fs.appendFile(file, JSON.stringify(moderationMutes, null, 2));

    await fs.appendFile(
      file,
      "\n----------------------------------------------\n\n----------\nYOUR MODERATION BAN DATA\n----------\n\n"
    );
    await fs.appendFile(file, JSON.stringify(moderationBans, null, 2));

    await fs.appendFile(
      file,
      "\n----------------------------------------------\n\n----------\nYOUR CHAT REACTION DATA\n----------\n\n"
    );
    await fs.appendFile(file, JSON.stringify(chatReactionStats, null, 2));

    const buffer = await fs.readFile(file);

    return { attachment: buffer, name: `data_for_${user.id}.txt` };
  };

  const showUser = async (id: string) => {
    const res = await (message.client as NypsiClient).cluster.broadcastEval(
      async (c, { userId }) => {
        const g = await c.users.fetch(userId);

        return g;
      },
      { context: { userId: id } }
    );

    let user: User;

    for (const i of res) {
      if ((i as any).username) {
        user = i as User;
        break;
      }
    }

    if (!user) {
      message.react("❌");
      user = {} as User;
    }

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("db-data").setLabel("view all db data").setStyle(ButtonStyle.Primary).setEmoji("💻"),
        new ButtonBuilder().setCustomId("cmds").setLabel("command count").setStyle(ButtonStyle.Primary).setEmoji("⌨️"),
        new ButtonBuilder().setCustomId("view-premium").setLabel("premium").setStyle(ButtonStyle.Primary).setEmoji("💎"),
        new ButtonBuilder().setCustomId("set-admin").setLabel("set admin level").setStyle(ButtonStyle.Primary).setEmoji("👨🏻‍💼")
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ac-hist").setLabel("anticheat info").setStyle(ButtonStyle.Primary).setEmoji("🤥"),
        new ButtonBuilder().setCustomId("ac-clear").setLabel("clear violations").setStyle(ButtonStyle.Primary).setEmoji("😃")
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("set-bal").setLabel("set balance").setStyle(ButtonStyle.Danger).setEmoji("💰"),
        new ButtonBuilder().setCustomId("set-bank").setLabel("set bank").setStyle(ButtonStyle.Danger).setEmoji("💳"),
        new ButtonBuilder().setCustomId("set-prestige").setLabel("set prestige").setStyle(ButtonStyle.Danger).setEmoji("🌟"),
        new ButtonBuilder().setCustomId("set-xp").setLabel("set xp").setStyle(ButtonStyle.Danger).setEmoji("✨"),
        new ButtonBuilder().setCustomId("set-inv").setLabel("modify inventory").setStyle(ButtonStyle.Danger).setEmoji("🎒")
      ),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("set-karma").setLabel("set karma").setStyle(ButtonStyle.Danger).setEmoji("🔮"),
        new ButtonBuilder().setCustomId("ecoban").setLabel("economy ban").setStyle(ButtonStyle.Danger).setEmoji("❌"),
        new ButtonBuilder().setCustomId("blacklist").setLabel("blacklist").setStyle(ButtonStyle.Danger).setEmoji("❌")
      ),
    ];

    let desc = `tag: ${user?.username}#${user?.discriminator}\nid: ${user?.id}\ncreated: <t:${Math.floor(
      user.createdTimestamp / 1000
    )}:R>\nadmin level: ${await getAdminLevel(user.id)}`;

    if (!(await hasProfile(user.id))) desc += "\n**has no user profile**";

    if (await isUserBlacklisted(user.id)) {
      rows[3].components[1].setDisabled(true);
      desc += "\n**currently blacklisted**";
    } else if (await isEcoBanned(user.id)) {
      desc += "\n**currently economy banned**";
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(`${user.username}'s discord data`);

    const msg = await message.channel.send({ embeds: [embed], components: rows });

    const waitForButton = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "db-data") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **1** to do this")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) viewd ${user.id} db data`);

        const files = [await getDbData(user)];

        await res.editReply({ files });
        return waitForButton();
      } else if (res.customId === "cmds") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **1** to do this")] });
          return waitForButton();
        }
        const uses = await getCommandUses(user.id);
        const total = uses.map((x) => x.uses).reduce((a, b) => a + b);

        const daily = parseInt(await redis.hget(Constants.redis.nypsi.TOP_COMMANDS_USER, user.tag));

        const embed = new CustomEmbed(
          message.member,
          `**total** ${total.toLocaleString()}\n**daily** ${daily.toLocaleString()}\n\n${uses
            .map((i) => `\`${i.command}\`: ${i.uses.toLocaleString()}`)
            .join("\n")}`
        );

        logger.info(`admin: ${message.author.tag} (${message.author.id}) viewed ${user.id} command data`);

        await res.editReply({ embeds: [embed] });
        return waitForButton();
      } else if (res.customId === "view-premium") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **1** to do this")] });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) viewed ${user.id} premium data`);
        doPremium(user, res as ButtonInteraction);
        return waitForButton();
      } else if (res.customId === "set-admin") {
        if ((await getAdminLevel(message.author.id)) < 69) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **69** to do this")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "enter new admin level")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > (await getAdminLevel(message.author.id))) {
          await res.editReply({
            embeds: [new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN")],
          });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) updated ${user.id} admin level to ${msg.content}`);
        await setAdminLevel(user.id, parseInt(msg.content));
        await res.editReply({ embeds: [new CustomEmbed(message.member, "✅")] });
        return waitForButton();
      } else if (res.customId === "ac-hist") {
        if ((await getAdminLevel(message.author.id)) < 2) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **2** to do this")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) viewed ${user.id} ac data`);

        const data = b(user.id);

        await res.editReply({ embeds: [new CustomEmbed(message.member, `\`\`\`${JSON.stringify(data, null, 2)}\`\`\``)] });
        return waitForButton();
      } else if (res.customId === "ac-clear") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **3** to do this")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) cleared ${user.id} violations`);

        c(user.id);

        await res.editReply({ content: "✅" });
        return waitForButton();
      } else if (res.customId === "set-bal") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              "enter a none stupid number pls remember if you do this for a joke this money could very easily be distributed between members & put into items"
            ),
          ],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} balance to ${msg.content}`);
        await updateBalance(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-bank") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [
            new CustomEmbed(
              message.member,
              "enter a none stupid number pls remember if you do this for a joke this money could very easily be distributed between members & put into items"
            ),
          ],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} bank balance to ${msg.content}`);
        await updateBankBalance(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-prestige") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new prestige")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} prestige to ${msg.content}`);
        await setPrestige(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-xp") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new xp value")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} xp to ${msg.content}`);
        await updateXp(user.id, parseInt(msg.content));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-inv") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "<item_id> <amount>")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} inventory item to ${msg.content}`);

        if (!getItems()[msg.content.split(" ")[0]]) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid item")] });
          return waitForButton();
        }

        if (!parseInt(msg.content.split(" ")[1])) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid number")] });
          return waitForButton();
        }

        if (
          (["crate", "scratch-card"].includes(getItems()[msg.content.split(" ")[0]].role) ||
            msg.content.split(" ").includes("credit")) &&
          (await getAdminLevel(message.author.id)) < 10
        ) {
          await res.editReply({
            embeds: [
              new ErrorEmbed("nice try LOSER HAHAHAHHAHAHAHAHAAHHAHAHAH wanker.").setImage(
                "https://giphy.com/clips/thefastsaga-fast-and-furious-saga-fate-of-the-Pv2AsOz7eYUkAqh1d5"
              ),
            ],
          });
          return waitForButton();
        }

        await setInventoryItem(user.id, msg.content.split(" ")[0], parseInt(msg.content.split(" ")[1]));
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-karma") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **4** to do this")] });
          return waitForButton();
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "enter new karma value")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }

        const karma = await getKarma(user.id);

        let amount = 0;
        let remove = false;

        if (parseInt(msg.content) < karma) {
          remove = true;
          amount = karma - parseInt(msg.content);
        } else {
          amount = parseInt(msg.content) - karma;
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} karma to ${msg.content}`);
        remove ? await removeKarma(user.id, amount) : addKarma(user.id, amount);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "ecoban") {
        if ((await getAdminLevel(message.author.id)) < 4) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **2** to do this")] });
          return waitForButton();
        }

        if (await isEcoBanned(user.id)) {
          logger.info(`admin: ${message.author.tag} (${message.author.id}) removed ecoban for ${user.id} `);
          await setEcoBan(user.id);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "removed eco ban")] });
          return;
        }

        await res.editReply({
          embeds: [new CustomEmbed(message.member, "ban length format pls")],
        });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;

        const time = new Date(Date.now() + getDuration(msg.content.toLowerCase()) * 1000);

        if (!time) {
          await res.editReply({ embeds: [new ErrorEmbed("invalid length")] });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} ecoban to ${msg.content}`);
        await setEcoBan(user.id, time);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "blacklist") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **3** to do this")] });
          return waitForButton();
        }

        if (await isUserBlacklisted(user.id)) {
          logger.info(`admin: ${message.author.tag} (${message.author.id}) removed blacklist for ${user.id} `);
          await setUserBlacklist(user.id, false);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user unblacklisted")] });
          return waitForButton();
        } else {
          logger.info(`admin: ${message.author.tag} (${message.author.id}) added blacklist for ${user.id} `);
          await setUserBlacklist(user.id, true);
          await res.editReply({ embeds: [new CustomEmbed(message.member, "user blacklisted")] });
          return waitForButton();
        }
      }
    };
    return waitForButton();
  };

  const doPremium = async (user: User, response: ButtonInteraction) => {
    let desc = "";

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("add-premium").setLabel("add premium").setStyle(ButtonStyle.Primary).setEmoji("➕"),
        new ButtonBuilder().setCustomId("set-tier").setLabel("set tier").setStyle(ButtonStyle.Primary).setEmoji("😁"),
        new ButtonBuilder()
          .setCustomId("set-expire")
          .setLabel("set expire date")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("😣"),
        new ButtonBuilder().setCustomId("raw-data").setLabel("view raw data").setStyle(ButtonStyle.Primary).setEmoji("🥩")
      ),

      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("del-cmd").setLabel("delete cmd").setStyle(ButtonStyle.Danger).setEmoji("❌"),
        new ButtonBuilder()
          .setCustomId("del-aliases")
          .setLabel("delete aliases")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
        new ButtonBuilder().setCustomId("expire-now").setLabel("expire now").setStyle(ButtonStyle.Danger).setEmoji("❌")
      ),
    ];

    const embed = new CustomEmbed(message.member);

    if (await isPremium(user.id)) {
      const profile = await getPremiumProfile(user.id);
      const aliases = await getUserAliases(user.id);

      rows[0].components[0].setDisabled(true);
      desc +=
        `**level** ${profile.getLevelString()}\n` + `**expires** <t:${Math.floor(profile.expireDate.getTime() / 1000)}>`;

      embed.setDescription(desc);
      if (aliases.length > 0) {
        embed.addField("aliases", aliases.map((i) => `\`${i.alias}\` -> \`${i.command}\``).join("\n"));
      }
    } else {
      rows.forEach((i) => i.components.forEach((j) => j.setDisabled(true)));
      rows[0].components[0].setDisabled(false);

      embed.setDescription("no premium");
    }

    const msg = await response.editReply({ embeds: [embed], components: rows });

    const waitForButton = async (): Promise<void> => {
      const filter = (i: Interaction) => i.user.id == message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 120000 }).catch(async () => {
        await msg.edit({ components: [] });
      });

      if (!res) return;

      await res.deferReply();

      if (res.customId === "add-premium") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **5** to do this")] });
          return waitForButton();
        }

        if (await isPremium(user.id)) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "1-4?")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > 4 || parseInt(msg.content) < 1) {
          await res.editReply({
            embeds: [new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN")],
          });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) added ${user.id} premium at level ${msg.content}`);

        await addMember(user.id, parseInt(msg.content), message.client as NypsiClient);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-tier") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **5** to do this")] });
          return waitForButton();
        }

        if (!(await isPremium(user.id))) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "1-4?")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        if (!parseInt(msg.content)) {
          await res.editReply({ embeds: [new CustomEmbed(message.member, "invalid value")] });
          return waitForButton();
        }
        if (parseInt(msg.content) > 4 || parseInt(msg.content) < 1) {
          await res.editReply({
            embeds: [new CustomEmbed(message.member, "nice try bozo ! suck this dick you wANK STAIN")],
          });
          return waitForButton();
        }

        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} premium tier to ${msg.content}`);

        await setTier(user.id, parseInt(msg.content), message.client as NypsiClient);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "set-expire") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **5** to do this")] });
          return waitForButton();
        }

        if (!(await isPremium(user.id))) {
          await res.editReply({ embeds: [new ErrorEmbed("idiot bro")] });
          return waitForButton();
        }

        await res.editReply({ embeds: [new CustomEmbed(message.member, "pls use format mm/dd/yyyy")] });

        const msg = await message.channel
          .awaitMessages({
            filter: (msg: Message) => msg.author.id === message.author.id,
            max: 1,
            time: 30000,
          })
          .then((collected) => collected.first())
          .catch(() => {
            res.editReply({ embeds: [new CustomEmbed(message.member, "expired")] });
          });

        if (!msg) return;
        const date = dayjs(msg.content);

        if (!date) {
          await res.editReply({
            embeds: [
              new ErrorEmbed(
                "invalid date you absolute fucking idiot like how do you mess that up are you actually like fucked in the head were you dropped on your head you special cunt go get a fucking helmet before I PUT A STICK IN YOUR CRANIUM YOU FUCKING WANKER"
              ),
            ],
          });
          return waitForButton();
        }

        logger.info(
          `admin: ${message.author.tag} (${message.author.id}) set ${user.id} premium expire date to ${date.format()}`
        );

        await setExpireDate(user.id, date.toDate(), message.client as NypsiClient);
        msg.react("✅");
        return waitForButton();
      } else if (res.customId === "raw-data") {
        if ((await getAdminLevel(message.author.id)) < 1) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **1** to do this")] });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) viewed ${user.id} raw premium data`);
        const profile = await getPremiumProfile(user.id);
        await res.editReply({
          embeds: [new CustomEmbed(message.member, `\`\`\`${JSON.stringify(profile, null, 2)}\`\`\``)],
        });
        return waitForButton();
      } else if (res.customId === "del-cmd") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **3** to do this")] });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) deleted ${user.id} custom command`);
        await prisma.premiumCommand.delete({ where: { owner: user.id } }).catch(() => {});
        await res.editReply({ embeds: [new CustomEmbed(message.member, "deleted custom command")] });
        return waitForButton();
      } else if (res.customId === "del-aliases") {
        if ((await getAdminLevel(message.author.id)) < 3) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **3** to do this")] });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) deleted ${user.id} aliases`);
        await prisma.userAlias.deleteMany({ where: { userId: user.id } });
        await res.editReply({ embeds: [new CustomEmbed(message.member, "deleted all aliases for that user")] });
        return waitForButton();
      } else if (res.customId === "expire-now") {
        if ((await getAdminLevel(message.author.id)) < 5) {
          await res.editReply({ embeds: [new ErrorEmbed("you require admin level **5** to do this")] });
          return waitForButton();
        }
        logger.info(`admin: ${message.author.tag} (${message.author.id}) set ${user.id} expire to now`);
        const profile = await getPremiumProfile(user.id);
        profile.expire(message.client as NypsiClient);
        await res.editReply({ embeds: [new CustomEmbed(message.member, "done sir.")] });
        return waitForButton();
      }
    };
    return waitForButton();
  };

  const findId = async (tag: string) => {
    const findFromCache = async () => {
      let user: any = await (message.client as NypsiClient).cluster.broadcastEval(
        async (c, { userId }) => {
          const g = await c.users.cache.find((u) => {
            return `${u.username}#${u.discriminator}`.includes(userId);
          });

          return g;
        },
        { context: { userId: tag } }
      );

      for (const res of user) {
        if (!res) continue;
        if (res.username) {
          user = res;
          break;
        }
      }

      if (!user || user instanceof Array) return null;

      return user.id as string;
    };

    const current = await findFromCache();

    let desc = `current: ${current || "not found"}`;

    const knownTag = await prisma.user.findFirst({
      where: {
        lastKnownTag: { contains: tag },
      },
      select: {
        id: true,
      },
    });

    desc += `\nlkt: ${knownTag?.id || "not found"}`;

    const usernameHistories = await prisma.username.findMany({
      where: {
        AND: [{ type: "username" }, { value: { contains: tag } }],
      },
      select: {
        value: true,
        userId: true,
      },
    });

    if (usernameHistories.length > 0) {
      desc += `\nhistories: \n${usernameHistories
        .map((i) => `\`${i.userId}\` - \`${i.value}\``)
        .join("\n")
        .substring(0, 1000)}`;
    }

    return message.channel.send({ embeds: [new CustomEmbed(message.member, desc)] });
  };

  if (args.length == 0) {
    const embed = new CustomEmbed(
      message.member,
      "$x userid (id) - view disc info and db info" +
        "\n$x removeitem (id) (item_id) (amount) - remove item from user inventory" +
        "\n$x findid (tag/username) - will attempt to find user id from cached users and database"
    );

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "userid") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("$x userid (id)")] });
    }

    return showUser(args[1]);
  } else if (args[0].toLowerCase() == "findid") {
    if (args.length == 1) {
      return message.channel.send({ embeds: [new ErrorEmbed("$x findid (tag)")] });
    }

    return findId(args[1]);
  }
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration: string): number {
  duration.toLowerCase();

  if (duration.includes("d")) {
    if (!parseInt(duration.split("d")[0])) return undefined;

    const num = parseInt(duration.split("d")[0]);

    return num * 86400;
  } else if (duration.includes("h")) {
    if (!parseInt(duration.split("h")[0])) return undefined;

    const num = parseInt(duration.split("h")[0]);

    return num * 3600;
  } else if (duration.includes("m")) {
    if (!parseInt(duration.split("m")[0])) return undefined;

    const num = parseInt(duration.split("m")[0]);

    return num * 60;
  } else if (duration.includes("s")) {
    if (!parseInt(duration.split("s")[0])) return undefined;

    const num = parseInt(duration.split("s")[0]);

    return num;
  }
}
