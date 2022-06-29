import { Client } from "discord.js";
import { topAmountGlobal } from "../economy/utils";
import { MStoTime } from "../functions/date";
import { logger } from "../logger";
import { CustomEmbed } from "../models/EmbedBuilders";

export async function showTopGlobalBal(client: Client) {
    const now = new Date();

    let d = `${now.getMonth() + 1}/${now.getDate() + 1}/${now.getUTCFullYear()}`;

    if (now.getHours() < 3) {
        d = `${now.getMonth() + 1}/${now.getDate()}/${now.getUTCFullYear()}`;
    }

    const needed = new Date(Date.parse(d) + 10800000);

    const postGlobalBalTop = async () => {
        const guild = await client.guilds.fetch("747056029795221513");

        if (!guild) {
            return logger.error("UNABLE TO FETCH GUILD FOR GLOBAL BAL TOP");
        }

        const channel = guild.channels.cache.find((ch) => ch.id == "833052442069434429");

        if (!channel) {
            return logger.error("UNABLE TO FIND CHANNEL FOR GLOBAL BAL TOP");
        }

        if (channel.type != "GUILD_TEXT") return;

        const baltop = await topAmountGlobal(10, client, true);

        const embed = new CustomEmbed();

        embed.setTitle("top 10 richest users");
        embed.setDescription(baltop.join("\n"));
        embed.setColor("#111111");

        await channel.send({ embeds: [embed] });
        logger.log({
            level: "auto",
            message: "sent global bal top",
        });
    };

    setTimeout(async () => {
        setInterval(() => {
            postGlobalBalTop();
        }, 86400000);
        postGlobalBalTop();
    }, needed.getTime() - now.getTime());

    logger.log({
        level: "auto",
        message: `global bal top will run in ${MStoTime(needed.getTime() - now.getTime())}`,
    });
}
