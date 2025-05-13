import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { inPlaceSort, sort } from "fast-sort";
import { cpu } from "node-os-utils";
import * as os from "os";
import prisma from "../init/database";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { unbanTimeouts, unmuteTimeouts } from "../scheduled/clusterjobs/moderationchecks";
import Constants from "../utils/Constants";
import { MStoTime } from "../utils/functions/date";
import {
  getAllGameWins,
  getGambleStats,
  getGameWins,
  getLeaderboardPositions,
  getScratchCardStats,
  getStats,
} from "../utils/functions/economy/stats";
import { getItems } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getCommandUses } from "../utils/functions/users/commands";

import { formatTime } from "../utils/functions/string";
import { getVersion } from "../utils/functions/version";
import { aliasesSize, commandsSize } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("stats", "view your nypsi stats", "info");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((economy) => economy.setName("gamble").setDescription("view your gamble stats"))
  .addSubcommand((item) => item.setName("item").setDescription("view your item stats"))
  .addSubcommand((commands) =>
    commands.setName("commands").setDescription("view your command usage stats"),
  )
  .addSubcommand((bot) => bot.setName("bot").setDescription("view nypsi's stats"))
  .addSubcommand((auction) => auction.setName("auction").setDescription("view your auction stats"))
  .addSubcommand((lb) =>
    lb.setName("leaderboards").setDescription("view your leaderboard positions"),
  )
  .addSubcommand((earned) =>
    earned.setName("earned").setDescription("view your stats for sources of income"),
  )
  .addSubcommand((spent) =>
    spent.setName("spent").setDescription("view your stats for sources of outgoings"),
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

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  const gambleStats = async () => {
    const gambleStats = await getGambleStats(message.member);

    if (gambleStats.length == 0) {
      return send({ embeds: [new ErrorEmbed("you have no gamble stats")] });
    }

    const winsMap = new Map<string, number>();

    const promises: Promise<any>[] = [];

    for (const stat of gambleStats) {
      const getWins = async () => {
        const gameWins = await getGameWins(message.member, stat.game);

        winsMap.set(stat.game, gameWins);
      };

      promises.push(getWins());
    }

    await Promise.all(promises);

    const pages = new Map<string, string>();
    const options = new StringSelectMenuBuilder().setCustomId("game_type");

    for (const stat of gambleStats) {
      const wins = winsMap.get(stat.game) || 0;
      const ratio = `${wins.toLocaleString()}/${stat._count._all.toLocaleString()} (${(
        (wins / stat._count._all) *
        100
      ).toFixed(1)}%)`;

      options.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(stat.game)
          .setValue(stat.game)
          .setDescription(ratio),
      );

      if (stat.game.includes("scratch")) {
        pages.set(stat.game, ratio);
      } else {
        pages.set(
          stat.game,
          ratio +
            "\n\n" +
            `**profit** $${(Number(stat._sum.earned) - Number(stat._sum.bet)).toLocaleString()}\n` +
            `**xp** ${Number(stat._sum.xpEarned).toLocaleString()}\n` +
            `**avg bet** $${Math.floor(Number(stat._avg.bet)).toLocaleString()}`,
        );
      }
    }

    const render = (type: string) => {
      options.options.forEach((o) => o.setDefault(false));
      options.options.find((o) => o.data.value === type).setDefault(true);

      const rows = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("history")
            .setURL(`https://nypsi.xyz/game?user=${message.author.id}&game=${type}`)
            .setEmoji("📖"),
        ),
      ];

      const embed = new CustomEmbed(message.member, pages.get(type)).setHeader(
        `${type} stats`,
        message.author.avatarURL(),
      );

      return { embeds: [embed], components: rows };
    };

    let rendered = render(gambleStats[0].game);

    const msg = await send(rendered);

    const listen = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          time: 60000,
          componentType: ComponentType.StringSelect,
        })
        .catch(() => {
          rendered.components.forEach((i) => i.components.forEach((j) => j.setDisabled(true)));
          msg.edit({ components: rendered.components });
        });

      if (!interaction) return;

      if (interaction.customId === "game_type") {
        rendered = render(interaction.values[0]);
        interaction.update(rendered);
        return listen();
      }
    };

    listen();
  };

  const wordleStats = async () => {
    const wins: Promise<{ guessAmount: number; count: number }[]> =
      prisma.$queryRaw`select array_length(guesses, 1) as "guessAmount", count(*) from "WordleGame" where won = true and "userId" = ${message.author.id} group by "guessAmount" order by "guessAmount";`;
    const loses = prisma.wordleGame.count({
      where: { AND: [{ userId: message.author.id }, { won: false }] },
    });
    const fastest = prisma.wordleGame.findFirst({
      select: {
        time: true,
      },
      where: {
        AND: [{ userId: message.author.id }, { won: true }, { time: { gt: 0 } }],
      },
      orderBy: { time: "asc" },
    });
    const average = prisma.wordleGame.aggregate({
      where: {
        AND: [{ userId: message.author.id }, { won: true }, { time: { gt: 0 } }],
      },
      _avg: {
        time: true,
      },
    });

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s wordle stats`,
      message.author.avatarURL(),
      `https://nypsi.xyz/user/${message.author.id}?ref=bot-wordle`,
    );

    let desc = "";

    for (const stat of await wins) {
      desc += `${new Array(stat.guessAmount - 1).fill("<:solid_grey:987046773157691452>").join("")}:green_square: **${stat.count.toLocaleString()}**\n`;
    }

    if (await loses) desc += `:red_square: **${(await loses).toLocaleString()}**\n`;

    if ((await fastest)?.time) desc += `**fastest** \`${formatTime((await fastest).time)}\`\n`;
    if ((await average)?._avg?.time)
      desc += `**average** \`${formatTime((await average)._avg.time)}\`\n`;

    embed.setDescription(desc);

    return send({ embeds: [embed] });
  };

  const scratchStats = async () => {
    const scratchStats = await getScratchCardStats(message.member);

    if (scratchStats.length == 0) {
      return send({ embeds: [new ErrorEmbed("you have no scratch card stats")] });
    }

    const fields: { name: string; value: string; inline: boolean }[] = [];

    for (const stat of scratchStats) {
      fields.push({
        name: getItems()[stat.game].name,
        value: `${stat._sum.win.toLocaleString()}/${stat._count._all.toLocaleString()} (${(
          (stat._sum.win / stat._count._all) *
          100
        ).toFixed(1)}%)`,
        inline: true,
      });
    }

    const pages = PageManager.createPages(fields, 6);

    const embed = new CustomEmbed(message.member)
      .setFields(pages.get(1))
      .setHeader("scratch card stats", message.author.avatarURL());

    if (pages.size > 1) {
      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("⬅")
          .setLabel("back")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      );
      const msg = await send({ embeds: [embed], components: [row] });
      const manager = new PageManager({
        embed,
        row,
        message: msg,
        userId: message.author.id,
        pages,
        updateEmbed(page, embed) {
          return embed.setFields(page);
        },
      });

      return manager.listen();
    }

    return send({ embeds: [embed] });
  };

  const itemStats = async () => {
    const itemStats = await getStats(message.member).then((stats) =>
      stats.filter((i) => Boolean(getItems()[i.itemId])),
    );

    if (itemStats.length == 0) {
      return send({ embeds: [new ErrorEmbed("you have no item stats")] });
    }

    const pages = PageManager.createPages(
      itemStats.map(
        (i) =>
          `${getItems()[i.itemId].emoji} **${
            getItems()[i.itemId].name
          }** ${i.amount.toLocaleString()} use${Number(i.amount) != 1 ? "s" : ""}`,
      ),
    );

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      "item stats",
      message.author.avatarURL(),
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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

    const pages = PageManager.createPages(
      uses.map((i) => `\`$${i.command}\` ${i.uses.toLocaleString()}`),
    );

    const commandUses = parseInt(
      await redis.hget(Constants.redis.nypsi.TOP_COMMANDS_USER, message.author.id),
    );

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
      .setHeader("most used commands", message.author.avatarURL())
      .setFooter({
        text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | 1/${
          pages.size
        }`,
      });

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
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

      const newEmbed = new CustomEmbed(message.member).setHeader(
        "most used commands",
        message.author.avatarURL(),
      );

      if (reaction == "⬅") {
        if (currentPage <= 1) {
          return pageManager();
        } else {
          currentPage--;

          newEmbed.setDescription(pages.get(currentPage).join("\n"));

          newEmbed.setFooter({
            text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | ${currentPage}/${
              pages.size
            }`,
          });

          if (currentPage == 1) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
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
            text: `total: ${total.toLocaleString()} | today: ${commandUses.toLocaleString()} | ${currentPage}/${
              pages.size
            }`,
          });

          if (currentPage == pages.size) {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            );
          } else {
            row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("⬅")
                .setLabel("back")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("➡")
                .setLabel("next")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
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
    logger.debug(`unmute timeouts: ${unmuteTimeouts.size}`);
    logger.debug(`unban timeouts: ${unbanTimeouts.size}`);

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

    const embed = new CustomEmbed(message.member)
      .setHeader(
        `nypsi stats | cluster: ${currentCluster + 1}/${clusterCount}`,
        client.user.avatarURL(),
      )
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
        true,
      )
      .addField(
        "mentions",
        `**queue size** ${await redis.llen(Constants.redis.nypsi.MENTION_QUEUE)}\n` +
          `**delay** ${Number(await redis.get(Constants.redis.nypsi.MENTION_DELAY)) || 5}\n` +
          `**max** ${Number(await redis.get(Constants.redis.nypsi.MENTION_MAX)) || 3}`,
        true,
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
        true,
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
      prisma.wordleGame.count(),
      prisma.market.count(),
      prisma.moderationBan.count(),
      prisma.moderationMute.count(),
      prisma.moderationCase.count(),
      prisma.mention.count(),
      prisma.graphMetrics.count(),
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
        `**wordle games** ${res[11].toLocaleString()}\n` +
        `**market orders** ${res[12].toLocaleString()}\n` +
        `**bans** ${res[13].toLocaleString()}\n` +
        `**mutes** ${res[14].toLocaleString()}\n` +
        `**cases** ${res[15].toLocaleString()}\n` +
        `**mentions** ${res[16].toLocaleString()}\n` +
        `**graph data** ${res[17].toLocaleString()}`,
    );

    return send({ embeds: [embed] });
  };

  function findStatAmount(stats: { amount: bigint; itemId: string }[], id: string) {
    return stats.find((i) => i.itemId === id)?.amount.toLocaleString() || "0";
  }

  const earnedStats = async () => {
    const stats = sort(await getStats(message.member))
      .desc((i) => i.amount)
      .filter((i) => i.itemId.startsWith("earned-"));

    const desc: string[] = [];

    for (const stat of stats) {
      desc.push(`**${stat.itemId.split("-")[1]}** $${stat.amount.toLocaleString()}`);
    }

    return send({
      embeds: [
        new CustomEmbed(message.member, desc.join("\n")).setHeader(
          "earned stats",
          message.author.avatarURL(),
        ),
      ],
    });
  };

  const spentStats = async () => {
    const stats = sort(await getStats(message.member))
      .desc((i) => i.amount)
      .filter((i) => i.itemId.startsWith("spent-"));

    const desc: string[] = [];

    for (const stat of stats) {
      desc.push(`**${stat.itemId.split("-")[1]}** $${stat.amount.toLocaleString()}`);
    }

    return send({
      embeds: [
        new CustomEmbed(message.member, desc.join("\n")).setHeader(
          "spent stats",
          message.author.avatarURL(),
        ),
      ],
    });
  };

  const auctionStats = async () => {
    const stats = await getStats(message.member);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have created **${findStatAmount(stats, "auction-created")}** auction${
            findStatAmount(stats, "auction-created") === "1" ? "" : "s"
          } and sold **${findStatAmount(stats, "auction-sold-items")}** item${
            findStatAmount(stats, "auction-sold-items") === "1" ? "" : "s"
          }\n\nyou have bought **${findStatAmount(stats, "auction-bought-items")}** item${
            findStatAmount(stats, "auction-bought-items") === "1" ? "" : "s"
          } through auctions`,
        ),
      ],
    });
  };

  const sellStats = async () => {
    const stats = await getStats(message.member);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have earned $**${findStatAmount(
            stats,
            "earned-sold",
          ).toLocaleLowerCase()}** from selling items`,
        ),
      ],
    });
  };

  const lbStats = async () => {
    const positions = await getLeaderboardPositions(message.author.id);

    const embed = new CustomEmbed(message.member).setHeader(
      "leaderboard positions",
      message.author.avatarURL(),
    );

    if (positions.length === 0) {
      embed.setDescription("you are not on any leaderboards");
      return send({ embeds: [embed] });
    }

    const out: string[] = [];

    for (const position of inPlaceSort(positions).asc((i) => i.position)) {
      if (position.leaderboard.startsWith("item-")) {
        const item = getItems()[position.leaderboard.split("-")[1]];

        out.push(
          `${item.emoji} **${item.name}** ${
            position.position === 1
              ? "🥇"
              : position.position === 2
                ? "🥈"
                : position.position === 3
                  ? "🥉"
                  : `#${position.position}`
          }`,
        );
      } else {
        out.push(
          `**${position.leaderboard}** ${
            position.position === 1
              ? "🥇"
              : position.position === 2
                ? "🥈"
                : position.position === 3
                  ? "🥉"
                  : `#${position.position}`
          }`,
        );
      }
    }

    const pages = PageManager.createPages(out);

    embed.setDescription(pages.get(1).join("\n"));
    if (pages.size === 1) return send({ embeds: [embed] });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({ embed, message: msg, row, userId: message.author.id, pages });

    return manager.listen();
  };

  if (args.length == 0) {
    return gambleStats();
  } else if (args[0].toLowerCase() == "global" && message.author.id == Constants.TEKOH_ID) {
    const byTypeGamble = await prisma.game.groupBy({
      by: ["game"],
      _sum: {
        win: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          win: "desc",
        },
      },
    });

    const byItem = await prisma.stats.groupBy({
      by: ["itemId"],
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    });

    const embed = new CustomEmbed(message.member);

    const gambleMsg: string[] = [];

    for (const gamble of byTypeGamble) {
      const percent = (
        (Number(await getAllGameWins(gamble.game)) / gamble._count._all) *
        100
      ).toFixed(2);
      gambleMsg.push(
        `- **${gamble.game}** ${(
          await getAllGameWins(gamble.game)
        ).toLocaleString()} / ${gamble._count._all.toLocaleString()} (${percent}%)`,
      );
    }

    embed.addField("gamble wins", gambleMsg.join("\n"), true);

    const itemMsg: string[] = [];

    for (const item of byItem) {
      if (itemMsg.length >= gambleMsg.length) break;

      itemMsg.push(`- **${item.itemId}** ${item._sum.amount.toLocaleString()}`);
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
  } else if (args[0].toLowerCase().includes("scratch")) {
    return scratchStats();
  } else if (args[0].toLowerCase().includes("auction")) {
    return auctionStats();
  } else if (
    args[0].toLowerCase().includes("lb") ||
    args[0].toLowerCase().includes("leaderboard")
  ) {
    return lbStats();
  } else if (args[0].toLowerCase() === "sell") {
    return sellStats();
  } else if (args[0].toLowerCase() === "earned") {
    return earnedStats();
  } else if (args[0].toLowerCase() === "spent") {
    return spentStats();
  } else if (args[0].toLowerCase() === "wordle") {
    return wordleStats();
  } else {
    return gambleStats();
  }
}

cmd.setRun(run);

module.exports = cmd;
