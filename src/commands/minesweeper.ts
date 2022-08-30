import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageOptions,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import {
    addGamble,
    addToGuildXP,
    calcEarnedXp,
    calcMaxBet,
    createUser,
    formatBet,
    getBalance,
    getDefaultBet,
    getGuildByUser,
    getMulti,
    getXp,
    updateBalance,
    updateXp,
    userExists,
} from "../utils/economy/utils.js";
import { getPrefix } from "../utils/guilds/utils";
import { gamble, logger } from "../utils/logger.js";
import { NypsiClient } from "../utils/models/Client.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command.js";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const games = new Map<
    string,
    {
        bet: number;
        win: number;
        grid: string[];
        id: number;
        voted: number;
    }
>();

const abcde = new Map<string, number>();
const possibleLetters = ["a", "b", "c", "d", "e"];
const possibleNumbers = ["1", "2", "3", "4", "5"];

abcde.set("a", 0);
abcde.set("b", 1);
abcde.set("c", 2);
abcde.set("d", 3);
abcde.set("e", 4);

const cmd = new Command("minesweeper", "play minesweeper", Categories.MONEY).setAliases(["sweeper", "ms"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("bet").setDescription("amount to bet").setRequired(true));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (games.has(message.author.id)) {
        return send({ embeds: [new ErrorEmbed("you are already playing minesweeper")] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);
    const defaultBet = await getDefaultBet(message.member);

    if (args.length == 0 && !defaultBet) {
        const embed = new CustomEmbed(message.member)
            .setHeader("minesweeper help")
            .addField("usage", `${prefix}ms <bet>`)
            .addField(
                "game rules",
                "a 5x5 grid of white squares will be created\n" +
                    "once youve chosen your square, it will become green if there was no mine, if there was, you will lose your bet"
            );

        return send({ embeds: [embed] });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = (await formatBet(args[0], message.member).catch(() => {})) || defaultBet;

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}ms <bet>`)] });
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

    await addCooldown(cmd.name, message.member, 25);

    setTimeout(async () => {
        if (games.has(message.author.id)) {
            if (games.get(message.author.id).id == id) {
                games.delete(message.author.id);
                await updateBalance(message.member, (await getBalance(message.member)) + bet);
            }
        }
    }, 180000);

    await updateBalance(message.member, (await getBalance(message.member)) - bet);

    const id = Math.random();

    const grid = [
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
        "a",
    ];

    const bombs = Math.floor(Math.random() * 3) + 4;

    for (let i = 0; i < bombs; i++) {
        const num = Math.floor(Math.random() * 25);

        if (grid[num] != "b") {
            grid[num] = "b";
        } else {
            i--;
        }
    }

    const voteMulti = await getMulti(message.member);

    games.set(message.author.id, {
        bet: bet,
        win: 0,
        grid: grid,
        id: id,
        voted: voteMulti,
    });

    const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)").setHeader(
        "minesweeper",
        message.author.avatarURL()
    );

    const rows = getRows(grid, false);

    const msg = await send({ embeds: [embed], components: rows });

    playGame(message, msg).catch((e: string) => {
        logger.error(`error occured playing minesweeper - ${message.author.tag} (${message.author.id})`);
        console.error(e);
        return send({
            embeds: [new ErrorEmbed("an error occured while running - join support server")],
        });
    });
}

cmd.setRun(run);

module.exports = cmd;

function getRows(grid: string[], end: boolean) {
    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

    for (const item of grid) {
        let current = rows[rows.length - 1];

        if (!current || current.components.length >= 5) {
            current = new ActionRowBuilder<MessageActionRowComponentBuilder>();
            rows.push(current);
        }

        const coordinate = `${possibleLetters[current.components.length]}${rows.indexOf(current) + 1}`;

        if (coordinate === "e5") break;

        const button = new ButtonBuilder().setCustomId(coordinate).setLabel("\u200b");

        switch (item) {
            case "a":
                button.setStyle(ButtonStyle.Secondary);
                if (end) button.setDisabled(true);
                current.addComponents(button);
                break;
            case "b":
                button.setStyle(ButtonStyle.Secondary);
                if (end) button.setStyle(ButtonStyle.Danger).setDisabled(true);
                current.addComponents(button);
                break;
            case "c":
                button.setStyle(ButtonStyle.Success).setDisabled(true);
                current.addComponents(button);
                break;
            case "x":
                button.setStyle(ButtonStyle.Success).setDisabled(true);
                break;
        }
    }

    const button = new ButtonBuilder().setCustomId("finish").setLabel("finish").setStyle(ButtonStyle.Success);

    if (end) button.setDisabled(true);

    rows[4].addComponents(button);

    return rows;
}

function toLocation(coordinate: string) {
    const letter = coordinate.split("")[0];
    const number = coordinate.split("")[1];

    switch (number) {
        case "1":
            return abcde.get(letter);
        case "2":
            return abcde.get(letter) + 5;
        case "3":
            return abcde.get(letter) + 10;
        case "4":
            return abcde.get(letter) + 15;
        case "5":
            return abcde.get(letter) + 20;
    }
}

async function playGame(message: Message | (NypsiCommandInteraction & CommandInteraction), msg: Message): Promise<void> {
    if (!games.has(message.author.id)) return;

    const bet = games.get(message.author.id).bet;
    let win = games.get(message.author.id).win;
    const grid = games.get(message.author.id).grid;

    const embed = new CustomEmbed(message.member).setHeader("minesweeper", message.author.avatarURL());

    const edit = async (data: MessageEditOptions) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await msg.edit(data);
        }
    };

    const lose = async () => {
        gamble(message.author, "minesweeper", bet, false, 0);
        await addGamble(message.member, "minesweeper", false);
        embed.setColor("#e4334f");
        embed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")\n\n**you lose!!**"
        );
        games.delete(message.author.id);
        return await edit({ embeds: [embed], components: getRows(grid, true) });
    };

    const win1 = async () => {
        let winnings = Math.round(bet * win);

        embed.setColor("#5efb8f");
        if (games.get(message.author.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

            embed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString() +
                    "\n" +
                    "+**" +
                    Math.floor(games.get(message.member.user.id).voted * 100).toString() +
                    "**% bonus"
            );
        } else {
            embed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
                    "\n" +
                    "**" +
                    win +
                    "**x ($" +
                    Math.round(bet * win).toLocaleString() +
                    ")" +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString()
            );
        }

        const earnedXp = await calcEarnedXp(message.member, bet);

        if (earnedXp > 0) {
            await updateXp(message.member, (await getXp(message.member)) + earnedXp);
            embed.setFooter({ text: `+${earnedXp}xp` });

            const guild = await getGuildByUser(message.member);

            if (guild) {
                await addToGuildXP(guild.guildName, earnedXp, message.member, message.client as NypsiClient);
            }
        }

        gamble(message.author, "minesweeper", bet, true, winnings);
        await addGamble(message.member, "minesweeper", true);

        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
        games.delete(message.author.id);
        return await edit({ embeds: [embed], components: getRows(grid, true) });
    };

    const draw = async () => {
        gamble(message.author, "minesweeper", bet, true, bet);
        await addGamble(message.member, "minesweeper", true);
        embed.setColor("#e5ff00");
        embed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")" +
                "\n\n**draw!!**\nyou win $" +
                bet.toLocaleString()
        );
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
        games.delete(message.author.id);
        return await edit({ embeds: [embed], components: getRows(grid, true) });
    };

    if (win == 15) {
        win1();
        return;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;
    let fail = false;

    const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
        })
        .catch(() => {
            fail = true;
            games.delete(message.author.id);
            message.channel.send({ content: message.author.toString() + " minesweeper game expired" });
        });

    if (fail) return;

    if (typeof response != "string") return;

    if (response.length != 2 && response != "finish") {
        await message.channel.send({ content: message.author.toString() + " invalid coordinate, example: `a3`" });
        return playGame(message, msg);
    }

    if (response == "finish") {
        if (win < 1) {
            lose();
            return;
        } else if (win == 1) {
            draw();
            return;
        } else {
            win1();
            return;
        }
    } else {
        const letter = response.split("")[0];
        const number = response.split("")[1];

        let check = false;
        let check1 = false;

        for (const n of possibleLetters) {
            if (n == letter) {
                check = true;
                break;
            }
        }

        for (const n of possibleNumbers) {
            if (n == number) {
                check1 = true;
                break;
            }
        }

        if (!check || !check1) {
            await message.channel.send({
                content: message.author.toString() + " invalid coordinate, example: `a3`",
            });
            return playGame(message, msg);
        }
    }

    const location = toLocation(response);

    switch (grid[location]) {
        case "b":
            grid[location] = "x";
            lose();
            return;
        case "c":
            return playGame(message, msg);
        case "a":
            grid[location] = "c";

            if (win < 3) {
                win += 0.5;
            } else {
                win += 1;
            }

            games.set(message.author.id, {
                bet: bet,
                win: win,
                grid: grid,
                id: games.get(message.author.id).id,
                voted: games.get(message.author.id).voted,
            });

            embed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            );

            edit({ embeds: [embed], components: getRows(grid, false) });

            return playGame(message, msg);
    }
}
