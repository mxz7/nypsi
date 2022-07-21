import { Client } from "discord.js";
import prisma from "../../database/database";
import { daysUntil, MStoTime } from "../../functions/date";
import { deleteCountdown } from "../../guilds/utils";
import { logger } from "../../logger";
import { CustomEmbed } from "../../models/EmbedBuilders";

export function runCountdowns(client: Client) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const runCountdowns = async () => {
        const query = await prisma.guildCountdown.findMany();

        for (const countdown of query) {
            const guildID = countdown.guildId;

            const days = daysUntil(new Date(countdown.date)) + 1;

            let message;

            if (days == 0) {
                message = countdown.finalFormat;
            } else {
                message = countdown.format.split("%days%").join(days.toLocaleString());
            }

            const embed = new CustomEmbed();

            embed.setDescription(message);
            embed.setColor("#111111");
            embed.disableFooter();

            const guildToSend = await client.guilds.fetch(guildID).catch(() => {});

            if (!guildToSend) continue;

            const channel = guildToSend.channels.cache.find((ch) => ch.id == countdown.channel);

            if (!channel) continue;

            if (!channel.isTextBased()) continue;

            await channel
                .send({ embeds: [embed] })
                .then(() => {
                    logger.log({
                        level: "auto",
                        message: `sent custom countdown (${countdown.id}) in ${guildToSend.name} (${guildID})`,
                    });
                })
                .catch(() => {
                    logger.error(`error sending custom countdown (${countdown.id}) ${guildToSend.name} (${guildID})`);
                });

            if (days <= 0) {
                await deleteCountdown(guildID, countdown.id);
            }
        }
    };

    setTimeout(async () => {
        setInterval(() => {
            runCountdowns();
        }, 86400000);
        runCountdowns();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `custom countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}
