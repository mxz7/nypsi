import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { cpu } from "node-os-utils";
import * as os from "os";
import { workerCount } from "../events/message";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { MStoTime } from "../utils/functions/date";
import { getGambleStats, getItemStats } from "../utils/functions/economy/stats";
import { getItems } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getCommandUses } from "../utils/functions/users/commands";
import { mentionQueue } from "../utils/functions/users/mentions";
import { getVersion } from "../utils/functions/version";
import { aliasesSize, commandsSize } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("stats", "view your nypsi stats", Categories.INFO);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((economy) => economy.setName("economy").setDescription("view your economy stats"))
  .addSubcommand((commands) => commands.setName("commands").setDescription("view your command usage stats"))
  .addSubcommand((bot) => bot.setName("bot").setDescription("view nypsi's stats"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 25);

  const gambleStats = async () => {
    const gambleStats = await getGambleStats(message.member);

    if (gambleStats.length == 0) {
      return send({ embeds: [new ErrorEmbed("you have no gamble stats")] });
    }

    let desc = "";

    for (const stat of gambleStats) {
      desc += `\`${stat.game}\` ${stat._sum.win.toLocaleString()}/${stat._count._all.toLocaleString()} profit: $${(
        Number(stat._sum.earned) - Number(stat._sum.bet)
      ).toLocaleString()} xp: ${Number(stat._sum.xpEarned).toLocaleString()}\n`;
    }

    const embed = new CustomEmbed(message.member, desc).setHeader("gamble stats", message.author.avatarURL());

    return send({ embeds: [embed] });
  };

  const itemStats = async () => {
    const itemStats = await getItemStats(message.member);

    if (itemStats.length == 0) {
      return send({ embeds: [new ErrorEmbed("you have no item stats")] });
    }

    const pages = PageManager.createPages(
      itemStats.map((i) => `\`${getItems()[i.itemId]?.name}\` ${i.amount.toLocaleString()} uses`)
    );

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      "item stats",
      message.author.avatarURL()
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (pages.size == 1) {
      return send({ embeds: [embed] });
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      userId: message.author.id,
      embed: embed,
      message: msg,
      row: row,
      pages,
      onPageUpdate(manager) {
        manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
        return manager.embed;
      },
    });

    return manager.listen();
  };

  const commandStats = async () => {
    const uses = await getCommandUses(message.member);
    const total = uses.map((x) => x.uses).reduce((a, b) => a + b);

    const pages = PageManager.createPages(uses.map((i) => `\`$${i.command}\` ${i.uses.toLocaleString()}`));

    const commandUses = parseInt(await redis.hget(Constants.redis.nypsi.TOP_COMMANDS_USER, message.author.tag));

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
      .setHeader("most used commands", message.author.avatarURL())
      .setFooter({ text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | 1/${pages.size}` });

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    let msg: Message;

    if (pages.size == 1) {
      return await send({ embeds: [embed] });
    } else {
      msg = await send({ embeds: [embed], components: [row] });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    let currentPage = 1;

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
          await collected.deferUpdate();
          return collected.customId;
        })
        .catch(async () => {
          await edit({ components: [] }, msg).catch(() => {});
        });

      if (!reaction) return;

      const newEmbed = new CustomEmbed(message.member).setHeader("most used commands", message.author.avatarURL());

      if (reaction == "⬅") {
        if (currentPage <= 1) {
          return pageManager();
        } else {
          currentPage--;

          newEmbed.setDescription(pages.get(currentPage).join("\n"));

          newEmbed.setFooter({
            text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | 1/${pages.size}`,
          });

          if (currentPage == 1) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
            );
          }
          await edit({ embeds: [newEmbed], components: [row] }, msg);
          return pageManager();
        }
      } else if (reaction == "➡") {
        if (currentPage >= pages.size) {
          return pageManager();
        } else {
          currentPage++;

          newEmbed.setDescription(pages.get(currentPage).join("\n"));

          newEmbed.setFooter({
            text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | 1/${pages.size}`,
          });

          if (currentPage == pages.size) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
              new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
            );
          }
          await edit({ embeds: [newEmbed], components: [row] }, msg);
          return pageManager();
        }
      }
    };

    return pageManager();
  };

  const botStats = async () => {
    const systemUptime = MStoTime(os.uptime() * 1000);
    const uptime = MStoTime(message.client.uptime);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const memUsage = Math.round(totalMem - freeMem);
    const cpuUsage = await cpu.usage();

    const client = message.client as NypsiClient;

    const clusterCount = client.cluster.count;
    const currentCluster = client.cluster.id;
    const currentShard = message.guild.shardId;

    const userCount: number = await client.cluster
      .broadcastEval("this.users.cache.size")
      .then((res) => res.reduce((a, b) => a + b));
    const guildCount: number = await client.cluster
      .broadcastEval("this.guilds.cache.size")
      .then((res) => res.reduce((a, b) => a + b));

    let collections = 0;
    let mentions = 0;

    for (const mention of mentionQueue) {
      if (mention.type == "collection") {
        collections++;
      } else if (mention.type == "mention") {
        mentions++;
      }
    }

    const embed = new CustomEmbed(message.member)
      .setHeader(`nypsi stats | cluster: ${currentCluster + 1}/${clusterCount}`, client.user.avatarURL())
      .addField(
        "bot",
        "**server count** " +
          guildCount.toLocaleString() +
          "\n" +
          "**users cached** " +
          userCount.toLocaleString() +
          "\n" +
          "**total commands** " +
          commandsSize +
          "\n" +
          "**total aliases** " +
          aliasesSize,
        true
      )
      .addField(
        "mention queue",
        "**total** " +
          mentionQueue.length.toLocaleString() +
          "\n-- **collections** " +
          collections.toLocaleString() +
          "\n-- **mentions** " +
          mentions.toLocaleString() +
          "\n-- **workers** " +
          workerCount.toLocaleString(),
        true
      )
      .addField(
        "system",
        `**memory** ${memUsage.toLocaleString()}mb/${totalMem.toLocaleString()}mb\n` +
          `**cpu** ${cpuUsage}%\n` +
          `**uptime** ${systemUptime}\n` +
          `**load avg** ${os
            .loadavg()
            .map((i) => i.toFixed(2))
            .join(" ")}`,
        true
      )
      .addField("cluster", `**uptime** ${uptime}`, true);

    embed.setFooter({ text: `v${getVersion()} | shard: ${currentShard}` });

    return send({ embeds: [embed] });
  };

  const dbStats = async () => {
    const res = await Promise.all([
      prisma.user.count(),
      prisma.achievements.count(),
      prisma.economy.count(),
      prisma.inventory.count(),
      prisma.economyWorker.count(),
      prisma.economyWorkerUpgrades.count(),
      prisma.booster.count(),
      prisma.game.count(),
      prisma.premium.count(),
      prisma.premiumCommand.count(),
      prisma.username.count(),
      prisma.wordleStats.count(),
      prisma.auction.count(),
      prisma.moderationBan.count(),
      prisma.moderationMute.count(),
      prisma.moderationCase.count(),
      prisma.mention.count(),
    ]);

    const embed = new CustomEmbed(
      message.member,
      `**user** ${res[0].toLocaleString()}\n` +
        `**achievements** ${res[1].toLocaleString()}\n` +
        `**economy** ${res[2].toLocaleString()}\n` +
        `**inventory** ${res[3].toLocaleString()}\n` +
        `**worker** ${res[4].toLocaleString()}\n` +
        `**worker upgrades** ${res[5].toLocaleString()}\n` +
        `**boosters** ${res[6].toLocaleString()}\n` +
        `**stats** ${res[7].toLocaleString()}\n` +
        `**premium** ${res[8].toLocaleString()}\n` +
        `**premium command** ${res[9].toLocaleString()}\n` +
        `**username** ${res[10].toLocaleString()}\n` +
        `**wordle stats** ${res[11].toLocaleString()}\n` +
        `**auctions** ${res[12].toLocaleString()}\n` +
        `**bans** ${res[13].toLocaleString()}\n` +
        `**mutes** ${res[14].toLocaleString()}\n` +
        `**cases** ${res[15].toLocaleString()}\n` +
        `**mentions** ${res[16].toLocaleString()}`
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return gambleStats();
  } else if (args[0].toLowerCase() == "global" && message.author.id == Constants.TEKOH_ID) {
    const byTypeGamble = await prisma.game.groupBy({
      by: ["game"],
      _count: {
        win: true,
        _all: true,
      },
      orderBy: {
        _count: {
          win: "desc",
        },
      },
    });

    const byItem = await prisma.itemUse.groupBy({
      by: ["itemId"],
      _sum: {
        amount: true,
      },
    });

    const embed = new CustomEmbed(message.member);

    const gambleMsg: string[] = [];

    for (const gamble of byTypeGamble) {
      const percent = ((Number(gamble._count.win) / gamble._count._all) * 100).toFixed(2);

      gambleMsg.push(
        ` - **${gamble.game}** ${gamble._count.win.toLocaleString()} / ${gamble._count._all.toLocaleString()} (${percent}%)`
      );
    }

    embed.addField("gamble wins", gambleMsg.join("\n"), true);

    const itemMsg: string[] = [];

    for (const item of byItem) {
      if (itemMsg.length >= gambleMsg.length) break;

      itemMsg.push(` - **${item.itemId}** ${item._sum.amount.toLocaleString()}`);
    }

    embed.addField("item stats", itemMsg.join("\n"), true);

    embed.setHeader("global stats", message.author.avatarURL());
    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "economy" || args[0].toLowerCase() == "gamble") {
    return gambleStats();
  } else if (args[0].toLowerCase().includes("command") || args[0].toLowerCase().includes("cmd")) {
    return commandStats();
  } else if (args[0].toLowerCase().includes("bot") || args[0].toLowerCase().includes("nypsi")) {
    return botStats();
  } else if (args[0].toLowerCase() == "db" && message.author.id == Constants.TEKOH_ID) {
    return dbStats();
  } else if (args[0].toLowerCase().includes("item")) {
    return itemStats();
  } else {
    return gambleStats();
  }
}

cmd.setRun(run);

module.exports = cmd;
