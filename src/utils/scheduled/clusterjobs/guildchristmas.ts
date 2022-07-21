import { Client } from "discord.js";
import prisma from "../../database/database";
import { daysUntilChristmas, MStoTime } from "../../functions/date";
import { setChristmasCountdown } from "../../guilds/utils";
import { logger } from "../../logger";
import { CustomEmbed } from "../../models/EmbedBuilders";

export function runChristmas(client: Client) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const runChristmasThing = async () => {
        const query = await prisma.guildChristmas.findMany({
            where: {
                enabled: true,
            },
        });

        for (const profile of query) {
            const guild = client.guilds.cache.find((g) => g.id == profile.guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.find((c) => c.id == profile.channel);

            if (!channel) {
                profile.enabled = false;
                profile.channel = "none";
                await setChristmasCountdown(guild, profile);
                continue;
            }

            let format = profile.format;

            const days = daysUntilChristmas();

            format = format.split("%days%").join(daysUntilChristmas().toString());

            if (days == "ITS CHRISTMAS") {
                format = "MERRY CHRISTMAS EVERYONE I HOPE YOU HAVE A FANTASTIC DAY WOO";
            }

            if (!channel.isTextBased()) return;

            await channel
                .send({
                    embeds: [
                        new CustomEmbed()
                            .setDescription(format)
                            .setColor("#ff0000")
                            .setTitle(":santa_tone1:")
                            .disableFooter(),
                    ],
                })
                .then(() => {
                    logger.log({
                        level: "auto",
                        message: `sent christmas countdown in ${guild.name} ~ ${format}`,
                    });
                })
                .catch(async () => {
                    logger.error(`error sending christmas countdown in ${guild.name}`);
                    profile.enabled = false;
                    profile.channel = "none";
                    await setChristmasCountdown(guild, profile);
                });
        }
    };

    setTimeout(async () => {
        setInterval(() => {
            runChristmasThing();
        }, 86400000);
        runChristmasThing();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `christmas countdowns will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}
