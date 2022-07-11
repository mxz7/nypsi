import {
    getBalance,
    createUser,
    updateBalance,
    userExists,
    formatBet,
    getXp,
    updateXp,
    getMulti,
    calcMaxBet,
    addGamble,
    calcEarnedXp,
    getGuildByUser,
    addToGuildXP,
} from "../utils/economy/utils.js";
import { CommandInteraction, Message } from "discord.js";
import * as shuffle from "shuffle-array";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { gamble } from "../utils/logger.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const cmd = new Command("rockpaperscissors", "play rock paper scissors", Categories.MONEY).setAliases(["rps"]);

cmd.slashEnabled = true;
cmd.slashData
    .addStringOption((option) =>
        option
            .setName("choice")
            .setDescription("choice for the bet")
            .setRequired(true)
            .addChoice("🗿 rock", "rock")
            .addChoice("📰 paper", "paper")
            .addChoice("✂ scissors", "scissors")
    )
    .addIntegerOption((option) => option.setName("bet").setDescription("how much would you like to bet").setRequired(true));

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data);
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
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

    const prefix = getPrefix(message.guild);

    if (args.length == 0 || args.length == 1) {
        const embed = new CustomEmbed(message.member)
            .setHeader("rockpaperscissors help")
            .addField("usage", `${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)
            .addField(
                "help",
                "rock paper scissors works exactly how this game does in real life\n" + "**2**x multiplier for winning"
            );

        return send({ embeds: [embed] });
    }

    let choice = args[0];
    let memberEmoji = "";

    if (choice != "rock" && choice != "paper" && choice != "scissors" && choice != "r" && choice != "p" && choice != "s") {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        });
    }

    if (choice == "r") choice = "rock";
    if (choice == "p") choice = "paper";
    if (choice == "s") choice = "scissors";

    if (choice == "rock") memberEmoji = "🗿";
    if (choice == "paper") memberEmoji = "📰";
    if (choice == "scissors") memberEmoji = "✂";

    const maxBet = await calcMaxBet(message.member);

    const bet = await formatBet(args[1], message.member);

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (!bet) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
        });
    }

    if (bet <= 0) {
        return send({
            embeds: [new ErrorEmbed(`${prefix}rps <**r**ock/**p**aper/**s**cissors> <bet>`)],
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

    await updateBalance(message.member, (await getBalance(message.member)) - bet);

    const values = ["rock", "paper", "scissors"];

    const index = values.indexOf(choice);

    if (index > -1) {
        values.splice(index, 1);
    }

    const winning = shuffle(values)[Math.floor(Math.random() * values.length)];
    let winningEmoji = "";

    if (winning == "rock") winningEmoji = "🗿";
    if (winning == "paper") winningEmoji = "📰";
    if (winning == "scissors") winningEmoji = "✂";

    let win = false;
    let winnings = 0;

    if (choice == "rock" && winning == "scissors") {
        win = true;

        winnings = Math.round(bet * 1.5);
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    } else if (choice == "paper" && winning == "rock") {
        win = true;

        winnings = Math.round(bet * 1.5);
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    } else if (choice == "scissors" && winning == "paper") {
        win = true;

        winnings = Math.round(bet * 1.5);
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
    }

    let multi = 0;

    if (win) {
        multi = await getMulti(message.member);

        if (multi > 0) {
            await updateBalance(message.member, (await getBalance(message.member)) + Math.round(winnings * multi));
            winnings = winnings + Math.round(winnings * multi);
        }
    }

    const embed = new CustomEmbed(
        message.member,
        true,
        "*rock..paper..scissors..* **shoot!!**\n\n**choice** " +
            choice +
            " " +
            memberEmoji +
            "\n**bet** $" +
            bet.toLocaleString()
    ).setHeader("rock paper scissors", message.author.avatarURL());

    const edit = async (data, msg) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    send({ embeds: [embed] }).then(async (m) => {
        embed.setDescription(
            "**threw** " +
                winning +
                " " +
                winningEmoji +
                "\n\n**choice** " +
                choice +
                " " +
                memberEmoji +
                "\n**bet** $" +
                bet.toLocaleString()
        );

        if (win) {
            if (multi > 0) {
                embed.addField(
                    "**winner!!**",
                    "**you win** $" +
                        winnings.toLocaleString() +
                        "\n" +
                        "+**" +
                        Math.round(multi * 100).toString() +
                        "**% bonus"
                );
            } else {
                embed.addField("**winner!!**", "**you win** $" + winnings.toLocaleString());
            }

            const earnedXp = calcEarnedXp(message.member, bet);

            if (earnedXp > 0) {
                await updateXp(message.member, (await getXp(message.member)) + earnedXp);
                embed.setFooter(`+${earnedXp}xp`);

                const guild = getGuildByUser(message.member);

                if (guild) {
                    addToGuildXP(guild.guild_name, earnedXp, message.member);
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

    gamble(message.author, "rock paper scissors", bet, win, winnings);
    addGamble(message.member, "rps", win);
}

cmd.setRun(run);

module.exports = cmd;
