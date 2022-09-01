import { EmbedBuilder } from "discord.js";
import prisma from "../../database/database";
import { NypsiClient } from "../../models/Client";
import ms = require("ms");

export async function runSurveyChecks(client: NypsiClient) {
    setInterval(async () => {
        const query = await prisma.survey.findMany({
            where: {
                resultsAt: { lte: new Date() },
            },
        });

        for (const survey of query) {
            let data = "";

            const grouped = await prisma.surveyData.groupBy({
                where: {
                    surveyId: survey.id,
                },
                by: ["value"],
                _count: {
                    value: true,
                },
                orderBy: {
                    _count: {
                        value: "desc",
                    },
                },
            });

            await prisma.survey.delete({
                where: {
                    id: survey.id,
                },
            });

            for (const a of grouped) {
                if (data.length >= 1000) return;

                data += `${a.value}: **${a._count.value.toLocaleString()}**`;
            }

            const desc = `${survey.surveyText}\n\n**results**\n${data}`;

            const clusterHas = await client.cluster.broadcastEval(
                async (c, { channelId }) => {
                    const client = c as NypsiClient;
                    const channel = await client.channels.fetch(channelId).catch();

                    if (channel) {
                        return client.cluster.id;
                    } else {
                        return "not-found";
                    }
                },
                {
                    context: { channelId: survey.channelId },
                }
            );

            let shard: number;

            for (const i of clusterHas) {
                if (i != "not-found") {
                    shard = i;
                    break;
                }
            }

            await client.cluster.broadcastEval(
                async (c, { channelId, desc, messageId, shard, embed }) => {
                    if ((c as NypsiClient).cluster.id != shard) return;

                    const channel = await c.channels.fetch(channelId).catch(() => {});

                    if (!channel) return;
                    if (!channel.isTextBased()) return;

                    const message = await channel.messages.fetch(messageId).catch(() => {});

                    if (!message) return;

                    embed.author = {
                        name: message.embeds[0].author.name,
                        icon_url: message.embeds[0].author.iconURL,
                    };

                    embed.color = message.embeds[0].color;
                    embed.description = desc;

                    return await message.edit({ embeds: [embed], components: [] });
                },
                {
                    context: {
                        desc: desc,
                        messageId: survey.messageId,
                        channelId: survey.channelId,
                        shard: shard,
                        embed: new EmbedBuilder().toJSON(),
                    },
                }
            );
        }
    }, ms("20 minutes"));
}
