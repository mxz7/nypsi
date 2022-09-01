import prisma from "../../database/database";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";
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

            const channel = await client.channels.fetch(survey.channelId);

            if (!channel) continue;
            if (!channel.isTextBased()) continue;

            const message = await channel.messages.fetch(survey.messageId);

            const embed = new CustomEmbed();

            embed.setColor(message.embeds[0].color);
            embed.setHeader(message.embeds[0].author.name, message.embeds[0].author.iconURL);
            embed.setDescription(desc);

            await message.edit({ embeds: [embed], components: [] });
        }
    }, ms("1 minutes")); // change to hour
}
