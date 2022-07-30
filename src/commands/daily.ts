import dayjs = require("dayjs");
import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import {
    getBalance,
    getDailyStreak,
    getLastDaily,
    getXp,
    updateBalance,
    updateLastDaily,
    updateXp,
} from "../utils/economy/utils";
import { MStoTime } from "../utils/functions/date";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getTier, isPremium } from "../utils/premium/utils";

const cmd = new Command("daily", "get your daily bonus", Categories.MONEY);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 90);

    const lastDaily = await getLastDaily(message.member);

    if (lastDaily.getTime() > dayjs().subtract(1, "day").unix() * 1000) {
        const diff = lastDaily.getTime() - dayjs().subtract(1, "day").unix() * 1000;
        return message.channel.send({
            embeds: [new ErrorEmbed(`you can get your next daily bonus in **${MStoTime(diff)}**`)],
        });
    }

    const streak = await getDailyStreak(message.member);

    const base = 20000;

    let streakBonus = 850;

    if (await isPremium(message.member)) {
        const tier = await getTier(message.member);

        switch (tier) {
            case 1:
                streakBonus = 900;
                break;
            case 2:
                streakBonus = 950;
                break;
            case 3:
                streakBonus = 1000;
                break;
            case 4:
                streakBonus = 1100;
                break;
        }
    }

    const total = base + streakBonus * streak;

    let xp = 1;

    if (streak > 20) {
        xp = Math.floor((streak - 20) / 15);
    }

    await updateBalance(message.member, (await getBalance(message.member)) + total);
    await updateLastDaily(message.member);

    const embed = new CustomEmbed(message.member);
    embed.setHeader("daily", message.author.avatarURL());
    embed.setDescription(`+$**${total.toLocaleString()}**\ndaily streak: \`${streak + 1}\``);

    if (xp > 0) {
        await updateXp(message.member, (await getXp(message.member)) + xp);
        embed.setFooter({ text: `+${xp}xp` });
    }

    return message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
