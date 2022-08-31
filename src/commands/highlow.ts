import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GuildMember,
    Interaction,
    InteractionReplyOptions,
    Message,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageOptions,
} from "discord.js";
import * as shuffle from "shuffle-array";
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

const games = new Map<string, { bet: number; win: number; deck: string[]; card: string; id: number; voted: number }>();

const cmd = new Command("highlow", "higher or lower game", Categories.MONEY).setAliases(["hl"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(true)
);

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

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);
    const defaultBet = await getDefaultBet(message.member);

    if (args.length == 0 && !defaultBet) {
        const embed = new CustomEmbed(message.member)
            .setHeader("highlow help")
            .addField("usage", `${prefix}highlow <bet>\n${prefix}highlow info`)
            .addField(
                "game rules",
                "you'll receive your first card and you have to predict whether the next card you pick up will be higher or lower in value than the card that you have, you can cash out after predicting correctly once."
            )
            .addField(
                "help",
                "**A**ce | value of 1\n**J**ack | value of 11\n" +
                    "**Q**ueen | value of 12\n**K**ing | value of 13\n" +
                    "⬆ **higher** the next card will be higher in value than your current card\n" +
                    "⬇ **lower** the next card will be lower in value than your current card\n" +
                    "💰 **cash out** end the game and receive the current win\nmax win **15**x"
            );

        return send({ embeds: [embed] });
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(
            message.member,
            "highlow works exactly how it would in real life\n" +
                "when you create a game, a full 52 deck is shuffled in a random order\n" +
                "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
                "view the code for this [here](https://github.com/tekoh/nypsi/blob/main/src/commands/highlow.ts)"
        ).setHeader("highlow help");

        return send({ embeds: [embed] });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = (await formatBet(args[0], message.member).catch()) || defaultBet;

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}highlow <bet>`)] });
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

    if (games.has(message.member.user.id)) {
        return send({ embeds: [new ErrorEmbed("you are already playing highlow")] });
    }

    await addCooldown(cmd.name, message.member, 25);

    await updateBalance(message.member, (await getBalance(message.member)) - bet);

    const id = Math.random();

    const newDeck = [
        "A♠",
        "2♠",
        "3♠",
        "4♠",
        "5♠",
        "6♠",
        "7♠",
        "8♠",
        "9♠",
        "10♠",
        "J♠",
        "Q♠",
        "K♠",
        "A♣",
        "2♣",
        "3♣",
        "4♣",
        "5♣",
        "6♣",
        "7♣",
        "8♣",
        "9♣",
        "10♣",
        "J♣",
        "Q♣",
        "K♣",
        "A♥️",
        "2♥️",
        "3♥️",
        "4♥️",
        "5♥️",
        "6♥️",
        "7♥️",
        "8♥️",
        "9♥️",
        "10♥️",
        "J♥️",
        "Q♥️",
        "K♥️",
        "A♦",
        "2♦",
        "3♦",
        "4♦",
        "5♦",
        "6♦",
        "7♦",
        "8♦",
        "9♦",
        "10♦",
        "J♦",
        "Q♦",
        "K♦",
    ];

    const voteMulti = await getMulti(message.member);

    games.set(message.member.user.id, {
        bet: bet,
        win: 0,
        deck: shuffle(newDeck),
        card: "",
        id: id,
        voted: voteMulti,
    });

    setTimeout(async () => {
        if (games.has(message.author.id)) {
            if (games.get(message.author.id).id == id) {
                games.delete(message.author.id);
                await updateBalance(message.member, (await getBalance(message.member)) + bet);
            }
        }
    }, 180000);

    newCard(message.member);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("💰").setLabel("cash out").setStyle(ButtonStyle.Success).setDisabled(true)
    );

    const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString() + "\n**0**x ($0)")
        .setHeader("highlow", message.author.avatarURL())
        .addField("card", "| " + games.get(message.member.user.id).card + " |");

    send({ embeds: [embed], components: [row] }).then((m) => {
        playGame(message, m).catch((e: string) => {
            logger.error(`error occured playing highlow - ${message.author.tag} (${message.author.id})`);
            logger.error(e);
            return send({
                embeds: [new ErrorEmbed("an error occured while running - join support server")],
            });
        });
    });
}

cmd.setRun(run);

module.exports = cmd;

function newCard(member: GuildMember) {
    const deck = games.get(member.user.id).deck;

    const choice = deck[0];

    deck.shift();

    games.set(member.user.id, {
        bet: games.get(member.user.id).bet,
        win: games.get(member.user.id).win,
        deck: deck,
        card: choice,
        id: games.get(member.user.id).id,
        voted: games.get(member.user.id).voted,
    });
}

function getValue(member: GuildMember) {
    const card = games.get(member.user.id).card.toLowerCase();

    if (card.includes("k")) {
        return 13;
    } else if (card.includes("q")) {
        return 12;
    } else if (card.includes("j")) {
        return 11;
    } else if (card.includes("a")) {
        return 1;
    } else {
        if (!parseInt(card)) {
            return "ERROR";
        }
        return parseInt(card);
    }
}

async function playGame(message: Message | (NypsiCommandInteraction & CommandInteraction), m: Message): Promise<void> {
    if (!games.has(message.author.id)) return;

    const bet = games.get(message.member.user.id).bet;
    let win = games.get(message.member.user.id).win;
    let card = games.get(message.member.user.id).card;

    const newEmbed = new CustomEmbed(message.member).setHeader("highlow", message.author.avatarURL());

    const edit = async (data: MessageEditOptions) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    const lose = async () => {
        gamble(message.author, "highlow", bet, false, 0);
        await addGamble(message.member, "highlow", false);
        newEmbed.setColor("#e4334f");
        newEmbed.setDescription(
            "**bet** $" +
                bet.toLocaleString() +
                "\n**" +
                win +
                "**x ($" +
                Math.round(bet * win).toLocaleString() +
                ")" +
                "\n\n**you lose!!**"
        );
        newEmbed.addField("card", "| " + card + " |");
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    const win1 = async () => {
        let winnings = Math.round(bet * win);

        newEmbed.setColor("#5efb8f");
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

            newEmbed.setDescription(
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
            newEmbed.setDescription(
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
            newEmbed.setFooter({ text: `+${earnedXp}xp` });

            const guild = await getGuildByUser(message.member);

            if (guild) {
                await addToGuildXP(guild.guildName, earnedXp, message.member, message.client as NypsiClient);
            }
        }

        gamble(message.author, "highlow", bet, true, winnings);
        await addGamble(message.member, "highlow", true);

        newEmbed.addField("card", "| " + card + " |");
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
        games.delete(message.author.id);
        return edit({ embeds: [newEmbed], components: [] });
    };

    const draw = async () => {
        gamble(message.author, "highlow", bet, true, bet);
        await addGamble(message.member, "highlow", true);
        newEmbed.setColor("#E5FF00");
        newEmbed.setDescription(
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
        newEmbed.addField("card", "| " + card + " |");
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    if (win == 15) {
        win1();
        return;
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    let fail = false;

    const reaction = await m
        .awaitMessageComponent({ filter, time: 30000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
        })
        .catch(() => {
            fail = true;
            games.delete(message.author.id);
            message.channel.send({ content: message.author.toString() + " highlow game expired" });
        });

    if (fail) return;

    if (reaction == "⬆") {
        const oldCard = getValue(message.member);
        newCard(message.member);
        card = games.get(message.member.user.id).card;
        const newCard1 = getValue(message.member);

        if (newCard1 > oldCard) {
            if (win == 0) {
                win += 1;
            } else if (win > 2.5) {
                win += 1;
            } else {
                win += 0.5;
            }

            games.set(message.member.user.id, {
                bet: bet,
                win: win,
                deck: games.get(message.member.user.id).deck,
                card: games.get(message.member.user.id).card,
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            });

            let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("💰").setLabel("cash out").setStyle(ButtonStyle.Success).setDisabled(true)
            );

            if (win >= 1) {
                row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId("💰")
                        .setLabel("cash out")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(false)
                );
            }

            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            );
            newEmbed.addField("card", "| " + card + " |");
            await edit({ embeds: [newEmbed], components: [row] });
            return playGame(message, m);
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            );
            newEmbed.addField("card", "| " + card + " |");

            await edit({ embeds: [newEmbed] });
            return playGame(message, m);
        } else {
            lose();
            return;
        }
    } else if (reaction == "⬇") {
        const oldCard = getValue(message.member);
        newCard(message.member);
        card = games.get(message.member.user.id).card;
        const newCard1 = getValue(message.member);

        if (newCard1 < oldCard) {
            if (win < 2) {
                win += 0.5;
            } else {
                win += 1;
            }

            games.set(message.member.user.id, {
                bet: bet,
                win: win,
                deck: games.get(message.member.user.id).deck,
                card: games.get(message.member.user.id).card,
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            });

            let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("💰").setLabel("cash out").setStyle(ButtonStyle.Success).setDisabled(true)
            );

            if (win >= 1) {
                row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("⬆").setLabel("higher").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("⬇").setLabel("lower").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId("💰")
                        .setLabel("cash out")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(false)
                );
            }

            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            );
            newEmbed.addField("card", "| " + card + " |");
            await edit({ embeds: [newEmbed], components: [row] });
            return playGame(message, m);
        } else if (newCard1 == oldCard) {
            newEmbed.setDescription(
                "**bet** $" + bet.toLocaleString() + "\n**" + win + "**x ($" + Math.round(bet * win).toLocaleString() + ")"
            );
            newEmbed.addField("card", "| " + card + " |");
            await edit({ embeds: [newEmbed] });
            return playGame(message, m);
        } else {
            lose();
            return;
        }
    } else if (reaction == "💰") {
        if (win < 1) {
            return playGame(message, m);
        } else if (win == 1) {
            draw();
            return;
        } else {
            win1();
            return;
        }
    } else {
        games.delete(message.author.id);
        m.reactions.removeAll();
        return;
    }
}
