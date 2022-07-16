import { CommandInteraction, Message } from "discord.js";
import { getBalance, getMulti, updateBalance, userExists, createUser } from "../utils/economy/utils.js";
import { getPrefix } from "../utils/guilds/utils";
import { isPremium, getTier, getLastDaily, setLastDaily } from "../utils/premium/utils";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("daily", "get your daily bonus (patreon only)", Categories.MONEY);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 90);

    if (!(await userExists(message.member))) {
        await createUser(message.member);
    }

    const prefix = await getPrefix(message.guild);

    const notValidForYou = () => {
        const embed = new CustomEmbed(message.member, `${prefix}daily is for BRONZE tier and higher`).setFooter(
            `${prefix}patreon`
        );

        return message.channel.send({ embeds: [embed] });
    };

    if (!(await isPremium(message.author.id))) {
        return notValidForYou();
    } else {
        if ((await getTier(message.author.id)) < 1) {
            return notValidForYou();
        }

        const now = new Date();
        const lastDaily = await getLastDaily(message.author.id);
        const diff = now.getTime() - lastDaily.getTime();

        if (diff >= 86400000) {
            await setLastDaily(message.author.id, now);

            let amount = 75000;
            const multi = await getMulti(message.member);

            let description = `$${(await getBalance(message.member)).toLocaleString()}\n + $**${amount.toLocaleString()}**`;

            if (multi > 0) {
                amount = amount + Math.round(amount * multi);
                description = `$${(
                    await getBalance(message.member)
                ).toLocaleString()}\n + $**${amount.toLocaleString()}** (+**${Math.floor(
                    multi * 100
                ).toLocaleString()}**% bonus)`;
            }

            await updateBalance(message.member, (await getBalance(message.member)) + amount);

            const embed = new CustomEmbed(message.member, description);

            return message.channel.send({ embeds: [embed] }).then((msg) => {
                setTimeout(async () => {
                    embed.setDescription(`new balance: $**${(await getBalance(message.member)).toLocaleString()}**`);
                    msg.edit({ embeds: [embed] });
                }, 2000);
            });
        } else {
            const timeRemaining = Math.abs(86400000 - diff);
            const dd = timeUntil(new Date().getTime() + timeRemaining);

            const embed = new CustomEmbed(
                message.member,
                "you have already used your daily reward! come back in **" + dd + "**"
            );

            return message.channel.send({ embeds: [embed] });
        }
    }
}

function timeUntil(date) {
    const ms = Math.floor(date - new Date().getTime());

    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const daysms = ms % (24 * 60 * 60 * 1000);
    const hours = Math.floor(daysms / (60 * 60 * 1000));
    const hoursms = ms % (60 * 60 * 1000);
    const minutes = Math.floor(hoursms / (60 * 1000));
    const minutesms = ms % (60 * 1000);
    const sec = Math.floor(minutesms / 1000);

    let output = "";

    if (days > 0) {
        output = output + days + "d ";
    }

    if (hours > 0) {
        output = output + hours + "h ";
    }

    if (minutes > 0) {
        output = output + minutes + "m ";
    }

    if (sec > 0) {
        output = output + sec + "s";
    } else if (output != "") {
        output = output.substr(0, output.length - 1);
    }

    if (output == "") {
        output = "0s";
    }

    return output;
}

cmd.setRun(run);

module.exports = cmd;
