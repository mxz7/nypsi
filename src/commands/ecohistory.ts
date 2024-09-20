import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { isPremium } from "../utils/functions/premium/premium";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
//import dayjs = require("dayjs");

//const BASE_URL = "https://quickchart.io/chart/create";

const cmd = new Command(
  "ecohistory",
  "view your metric data history in a graph",
  "money",
).setAliases(["graph"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  //args: string[],
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

  if (!(await isPremium(message.member))) {
    return send({ embeds: [new ErrorEmbed("this command requires premium membership. /premium")] });
  }

  return send({ embeds: [new CustomEmbed(message.member, "moved to https://nypsi.xyz/me")] });

  // if (args.length == 0) {
  //   return send({
  //     embeds: [
  //       new ErrorEmbed(
  //         "**$graph balance** graph your balance history\n**$graph networth** graph your networth history\n**$graph karma** graph your karma history\n**$graph item <item>** graph an item",
  //       ),
  //     ],
  //   });
  // }

  // if (args[0].toLowerCase() == "all" && Constants.ADMIN_IDS.includes(message.author.id)) {
  //   const res = await getJsonGraphData(args[1].toLowerCase(), args.slice(2));

  //   console.log(res);

  //   const body = JSON.stringify({ chart: res });

  //   const response: { success: boolean; url: string } = await fetch(BASE_URL, {
  //     method: "POST",
  //     body,
  //     headers: { "Content-Type": "application/json" },
  //   }).then((res) => res.json());

  //   if (!response.success) {
  //     logger.warn("failed to create graph", res);
  //     return message.channel.send({ embeds: [new ErrorEmbed("failed to create graph")] });
  //   }

  //   return send({
  //     content: response.url,
  //   });
  // }

  // await addCooldown(cmd.name, message.member, 10);

  // if (["balance", "bal"].includes(args[0].toLowerCase())) args[0] = "user-money";
  // if (["networth", "net"].includes(args[0].toLowerCase())) args[0] = "user-net";
  // if (["karma"].includes(args[0].toLowerCase())) args[0] = "user-karma";
  // if (args[0].toLowerCase() === "item") {
  //   if (args.length === 1) {
  //     return send({ embeds: [new ErrorEmbed("you must give an item to graph")] });
  //   }
  //   const item = selectItem(args.slice(1).join(" "));

  //   if (!item) return send({ embeds: [new ErrorEmbed("invalid item")] });
  //   args[0] = `user-item-${item.id}`;
  // }

  // const formatDataForUser = (
  //   data: { date: Date; value: number | bigint; userId?: string }[],
  // ): ChartData => {
  //   if (data.length == 0) {
  //     return null;
  //   }

  //   const chartData: ChartData = {
  //     type: "line",
  //     data: {
  //       labels: [],
  //       datasets: [
  //         {
  //           label: message.author.username,
  //           data: [],
  //           lineTension: 0.4,
  //         },
  //       ],
  //     },
  //   };

  //   if (!args[0].includes("item") && !args[0].includes("karma")) {
  //     chartData.options = {
  //       plugins: {
  //         tickFormat: {
  //           style: "currency",
  //           currency: "USD",
  //           minimumFractionDigits: 0,
  //         },
  //       },
  //     };
  //   }

  //   for (const item of data) {
  //     chartData.data.labels.push(dayjs(item.date).format("YYYY-MM-DD"));
  //     chartData.data.datasets[0].data.push(Number(item.value));
  //   }

  //   return chartData;
  // };

  // const createGraph = async () => {
  //   if (await redis.exists(`cache:ecograph:${args[0]}:${message.author.id}`)) {
  //     return await redis.get(`cache:ecograph:${args[0]}:${message.author.id}`);
  //   }

  //   const data = formatDataForUser(
  //     await prisma.graphMetrics.findMany({
  //       where: {
  //         AND: [{ category: args[0] }, { userId: message.author.id }],
  //       },
  //       orderBy: {
  //         date: "asc",
  //       },
  //     }),
  //   );

  //   if (!data)
  //     return message.channel.send({ embeds: [new ErrorEmbed("you have no data to graph")] });

  //   const body = JSON.stringify({ chart: data });

  //   const res: { success: boolean; url: string } = await fetch(BASE_URL, {
  //     method: "POST",
  //     body,
  //     headers: { "Content-Type": "application/json" },
  //   }).then((res) => res.json());

  //   if (!res.success) {
  //     logger.warn("failed to create graph", res);
  //     return message.channel.send({ embeds: [new ErrorEmbed("failed to create graph")] });
  //   }

  //   await redis.set(`cache:ecograph:${args[0]}:${message.author.id}`, res.url);
  //   await redis.expire(
  //     `cache:ecograph:${args[0]}:${message.author.id}`,
  //     Math.floor(
  //       (dayjs().add(1, "day").set("hour", 0).set("minutes", 0).toDate().getTime() - Date.now()) /
  //         1000,
  //     ),
  //   );

  //   return res.url;
  // };

  // const url = await createGraph();

  // if (typeof url !== "string") return;

  // return message.channel.send({ content: url });
}

cmd.setRun(run);

module.exports = cmd;
