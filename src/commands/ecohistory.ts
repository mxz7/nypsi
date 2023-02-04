import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { ChartData } from "../types/Chart";
import Constants from "../utils/Constants";
import { selectItem } from "../utils/functions/economy/inventory";
import { isPremium } from "../utils/functions/premium/premium";
import getJsonGraphData from "../utils/functions/workers/jsongraph";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

const BASE_URL = "https://quickchart.io/chart/create";

const cmd = new Command("ecohistory", "view your metric data history in a graph", "money").setAliases(["graph"]);

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

  if (!(await isPremium(message.member))) {
    return send({ embeds: [new ErrorEmbed("this command requires premium membership. /premium")] });
  }

  if (args.length == 0) {
    return send({
      embeds: [
        new ErrorEmbed(
          "**$graph balance** graph your balance history\n**$graph networth** graph your networth history\n**$graph item <item>** graph an item"
        ),
      ],
    });
  }

  if (args[0].toLowerCase() == "all" && Constants.ADMIN_IDS.includes(message.author.id)) {
    const res = await getJsonGraphData(args[1].toLowerCase(), args.slice(2));

    console.log(res);

    const body = JSON.stringify({ chart: res });

    const response: { success: boolean; url: string } = await fetch(BASE_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    }).then((res) => res.json());

    if (!response.success) {
      logger.warn(res);
      return message.channel.send({ embeds: [new ErrorEmbed("failed to create graph")] });
    }

    return send({
      content: response.url,
    });
  }

  await addCooldown(cmd.name, message.member, 30);

  if (["balance", "bal"].includes(args[0].toLowerCase())) args[0] = "user-money";
  if (["networth", "net"].includes(args[0].toLowerCase())) args[0] = "user-net";
  if (args[0].toLowerCase() === "item") {
    if (args.length === 1) {
      return send({ embeds: [new ErrorEmbed("you must give an item to graph")] });
    }
    const item = selectItem(args.slice(1).join(" "));

    if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });
    args[0] = `user-item-${item.id}`;
  }

  const formatDataForUser = (data: { date: Date; value: number | bigint; userId?: string }[]): ChartData => {
    if (data.length == 0) {
      return null;
    }

    const chartData: ChartData = {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: message.author.tag,
            data: [],
          },
        ],
      },
    };

    for (const item of data) {
      chartData.data.labels.push(dayjs(item.date).format("YYYY-MM-DD"));
      chartData.data.datasets[0].data.push(Number(item.value));
    }

    return chartData;
  };

  const data = formatDataForUser(
    await prisma.graphMetrics.findMany({
      where: {
        AND: [{ category: args[0] }, { userId: message.author.id }],
      },
    })
  );

  if (!data) return message.channel.send({ embeds: [new ErrorEmbed("you have no data to graph")] });

  const body = JSON.stringify({ chart: data });

  const res: { success: boolean; url: string } = await fetch(BASE_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  }).then((res) => res.json());

  if (!res.success) {
    logger.warn(res);
    return message.channel.send({ embeds: [new ErrorEmbed("failed to create graph")] });
  }

  return message.channel.send({ content: res.url });
}

cmd.setRun(run);

module.exports = cmd;
