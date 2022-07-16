import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    getXp,
    updateXp,
    calcMaxBet,
    getMulti,
    addGamble,
    calcEarnedXp,
    getGuildByUser,
    addToGuildXP,
} from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { gamble } from "../utils/logger.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const multipliers = {
    "🍒": 5,
    "🍋": 3,
    "🍊": 2.5,
    "🍇": 2,
    "🍉": 1.5,
};

const reel1 = ["🍉", "🍉", "🍉", "🍉", "🍉", "🍇", "🍇", "🍇", "🍇", "🍊", "🍊", "🍊", "🍊", "🍋", "🍋", "🍒"];
const reel2 = [
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍉",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍇",
    "🍊",
    "🍊",
    "🍊",
    "🍊",
    "🍋",
    "🍋",
    "🍋",
    "🍒",
    "🍒",
];
const reel3 = ["🍉", "🍉", "🍉", "🍉", "🍉", "🍉", "🍇", "🍇", "🍇", "🍇", "🍇", "🍊", "🍊", "🍊", "🍋", "🍋", "🍒", "🍒"];

const cmd = new Command("slots", "play slots", Categories.MONEY);

cmd.slashEnabled = true;

cmd.slashData.addIntegerOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(true)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (message.interaction) {
            return await message.reply(data);
        } else {
            return await message.channel.send(data);
        }
    };

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if (!(await userExists(message.member))) {
        await createUser(message.member);
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("slots help")
            .addField("usage", `${prefix}slots <bet>\n${prefix}slots info`)
            .addField(
                "help",
                "[slots has a ~39% winrate](https://github.com/tekoh/nypsi/blob/main/src/commands/slots.ts#L152)"
            );
        return send({ embeds: [embed] });
    }

    if (args.length == 1 && args[0] == "info") {
        let txt = "";

        for (const item in multipliers) {
            txt += `${item} | ${item} | ${item} **||** ${multipliers[item]} **x\n`;
        }

        const embed = new CustomEmbed(message.member).setHeader("win board").setDescription(txt);

        return send({ embeds: [embed] });
    }

    if (!args[0]) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)],
        });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = await formatBet(args[0], message.member);

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}slots <bet> | ${prefix}**slots info** shows the winning board`)],
        });
    }

    if (bet > (await getBalance(message.member))) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
    }

    if (bet > maxBet) {
        return send({
            embeds: [
                new ErrorEmbed(
                    `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`
                ),
            ],
        });
    }

    await addCooldown(cmd.name, message.member, 10);

    let one = reel1[Math.floor(Math.random() * reel1.length)];
    const two = reel2[Math.floor(Math.random() * reel2.length)];
    let three = reel3[Math.floor(Math.random() * reel3.length)];

    /**
     * the shit below results in an approximate 39% win rate overtime, resulting in an overall loss, without counting multiplier
     */

    if (one != two && two != three && one != three) {
        const chance = Math.floor(Math.random() * 41);
        const chanceScore = 4;
        const chanceScore2 = 8;

        if (chance < chanceScore) {
            one = two;
        } else if (chance < chanceScore2) {
            three = two;
        }
    }

    if (two == three && one != two) {
        const chance = Math.floor(Math.random() * 12);
        const chanceScore = 7;

        if (chance < chanceScore) {
            one = two;
        }
    }

    if (one == two && one != three) {
        const chance = Math.floor(Math.random() * 12);
        const chanceScore = 6;

        if (chance < chanceScore) {
            three = two;
        }
    }

    if (one == two && one == three && one != "🍒" && one != "🍋") {
        const chance = Math.floor(Math.random() * 10);

        if (chance < 4) {
            one == "🍋";
            two == "🍋";
            three == "🍋";
        } else if (chance < 2) {
            one == "🍒";
            two == "🍒";
            three == "🍒";
        }
    }

    let win = false;
    let winnings = 0;

    if (one == two && two == three) {
        const multiplier = multipliers[one];

        win = true;
        winnings = Math.round(multiplier * bet);
    } else if (one == two) {
        win = true;
        winnings = Math.round(bet * 1.2);
    }

    let multi = 0;

    if (win) {
        multi = await getMulti(message.member);
        winnings -= bet;

        if (multi > 0) {
            await updateBalance(
                message.member,
                (await getBalance(message.member)) + winnings + Math.round(winnings * multi)
            );
            winnings = winnings + Math.round(winnings * multi);
        } else {
            await updateBalance(message.member, (await getBalance(message.member)) + winnings);
        }
    } else {
        await updateBalance(message.member, (await getBalance(message.member)) - bet);
    }

    const embed = new CustomEmbed(
        message.member,
        "~~---------------~~\n" +
            one +
            " **|** " +
            two +
            " **|** " +
            three +
            "\n~~---------------~~\n**bet** $" +
            bet.toLocaleString()
    ).setHeader("slots", message.author.avatarURL());

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            return await message.editReply(data);
        } else {
            return await msg.edit(data);
        }
    };

    send({ embeds: [embed] }).then(async (m) => {
        if (win) {
            if (multi > 0) {
                embed.addField(
                    "**winner!!**",
                    "**you win** $" +
                        winnings.toLocaleString() +
                        "\n" +
                        "+**" +
                        Math.floor(multi * 100).toString() +
                        "**% bonus"
                );
            } else {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString());
            }

            const earnedXp = await calcEarnedXp(message.member, bet);

            if (earnedXp > 0) {
                await updateXp(message.member, (await getXp(message.member)) + earnedXp);
                embed.setFooter(`+${earnedXp}xp`);

                const guild = await getGuildByUser(message.member);

                if (guild) {
                    await addToGuildXP(guild.guildName, earnedXp, message.member);
                }
            }

            embed.setColor("#5efb8f");
        } else {
            embed.addField("**loser!!**", "**you lost** $" + bet.toLocaleString());
            embed.setColor("#e4334f");
        }

        setTimeout(() => {
            edit({ embeds: [embed] }, m);
        }, 1500);
    });

    gamble(message.author, "slots", bet, win, winnings);
    await addGamble(message.member, "slots", win);
}

cmd.setRun(run);

module.exports = cmd;
