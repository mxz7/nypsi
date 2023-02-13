import { Game, Prisma } from "@prisma/client";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { readFile, writeFile } from "node:fs/promises";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { fetchGame } from "../utils/functions/economy/stats";
import PageManager from "../utils/functions/page";
import { getLastKnownTag } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("viewgame", "view information about a completed gambling game", "info").setAliases(["game", "id"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "$viewgame <id> - view information about a game\n$viewgame search (game) (MM/DD/YYYY) (userid) (win) - use **null** to have any value"
        ),
      ],
    });
  }

  if (args[0].toLowerCase() === "search") {
    if (args.length !== 5) return send({ embeds: [new ErrorEmbed("invalid arguments")] });
    await addCooldown(cmd.name, message.member, 15);
    const search: Prisma.GameFindManyArgs = {
      where: { AND: [] },
      include: {
        economy: {
          select: {
            user: {
              select: {
                lastKnownTag: true,
              },
            },
          },
        },
      },
      take: 1000,
      orderBy: {
        date: "desc",
      },
    };

    if (args[1].toLowerCase() !== "null")
      (search.where.AND as Array<Prisma.GameWhereInput>).push({ game: args[1].toLowerCase() });
    if (args[2].toLowerCase() !== "null") {
      const start = dayjs(args[2]).set("hour", 0).set("minute", 0).set("second", 0);
      (search.where.AND as Array<Prisma.GameWhereInput>).push({ date: { gte: start.toDate() } });
      (search.where.AND as Array<Prisma.GameWhereInput>).push({ date: { lte: start.add(1, "day").toDate() } });
    }
    if (args[3].toLowerCase() !== "null") (search.where.AND as Array<Prisma.GameWhereInput>).push({ userId: args[3] });
    if (args[4].toLowerCase() !== "null")
      (search.where.AND as Array<Prisma.GameWhereInput>).push({ win: args[4].toLowerCase() == "true" ? 1 : 0 });

    const query: (Game & { economy?: { user?: { lastKnownTag?: string } } })[] = await prisma.game.findMany(search);

    if (query.length === 0) return send({ embeds: [new ErrorEmbed("no results found")] });

    const embed = new CustomEmbed(message.member).setFooter({
      text: `${query.length.toLocaleString()} ${query.length >= 1000 ? "(max) " : ""}results found`,
    });

    const pages = PageManager.createPages(
      query.map((game) => {
        let out =
          `**id** \`${game.id.toString(36)}\` \`(${game.id})\`\n` +
          `**user** \`${game.economy?.user?.lastKnownTag?.split("#")[0] || "[redacted]"}\`\n` +
          `**game** \`${game.game}\`\n` +
          `**time** <t:${Math.floor(game.date.getTime() / 1000)}>\n` +
          `**bet** $${game.bet.toLocaleString()}\n` +
          `**won** \`${Boolean(game.win)}\`\n`;

        if (game.win && !(game.game.includes("scratchie") || game.game.includes("scratch_card"))) {
          out += `**won money** $${game.earned.toLocaleString()}\n`;
          out += `**won xp** ${(game.xpEarned || 0).toLocaleString()}\n`;
        }

        if (game.outcome.startsWith("mines:") || game.game.includes("scratch_card") || game.game.includes("scratchie")) {
          out += `**outcome** do $id ${game.id.toString(36)}`;
        } else {
          out += `**outcome** ${game.outcome}`;
        }

        return out;
      }),
      1
    );

    embed.setDescription(pages.get(1)[0]);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    await writeFile(
      `/tmp/${message.author.id}.txt`,
      JSON.stringify(
        query.map((game) => {
          return {
            id: game.id.toString(36),
            user: game.economy?.user?.lastKnownTag?.split("#")[0] || "unknown",
            game: game.game,
            time: game.date,
            bet: game.bet,
            won: Boolean(game.win),
            earnedMoney: game.earned,
            earnedXp: game.xpEarned,
            outcome: game.outcome,
          };
        }),
        null,
        2
      )
    );

    const msg = await message.channel.send({
      embeds: [embed],
      components: [row],
      files: [{ attachment: await readFile(`/tmp/${message.author.id}.txt`), name: "data.txt" }],
    });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      pages,
    });

    return manager.listen();
  } else {
    await addCooldown(cmd.name, message.member, 7);

    const game = await fetchGame(args[0].toLowerCase());

    if (!game) return send({ embeds: [new ErrorEmbed(`couldn't find a game with id \`${args[0]}\``)] });

    const username = (await getLastKnownTag(game.userId).catch(() => null))?.split("#")[0];

    const embed = new CustomEmbed(message.member).setHeader(
      username ? `${username}'s ${game.game} game` : `id: ${game.id.toString(36)}`,
      message.author.avatarURL()
    );

    let components: ActionRowBuilder<MessageActionRowComponentBuilder>[];

    const desc =
      `**id** \`${game.id.toString(36)}\` \`(${game.id})\`\n` +
      `**user** \`${username || "[redacted]"}\`\n` +
      `**game** \`${game.game}\`\n` +
      `**time** <t:${Math.floor(game.date.getTime() / 1000)}>\n` +
      `**bet** $${game.bet.toLocaleString()}\n` +
      `**won** \`${Boolean(game.win)}\`\n`;

    if (game.outcome.startsWith("mines:")) {
      components = JSON.parse(
        game.outcome.slice(6, game.outcome.length)
      ) as ActionRowBuilder<MessageActionRowComponentBuilder>[];

      components[components.length - 1].components.length = 4;
    } else if (game.game.includes("scratch_card") || game.game.includes("scratchie")) {
      components = JSON.parse(game.outcome);
    } else {
      embed.addField("outcome", game.outcome, true);
    }

    if (game.win && !(game.game.includes("scratchie") || game.game.includes("scratch_card"))) {
      embed.addField("rewards", `$${game.earned.toLocaleString()}\n${game.xpEarned}xp`, true);
    }

    embed.setDescription(desc);

    return send({ embeds: [embed], components });
  }
}

cmd.setRun(run);

module.exports = cmd;
