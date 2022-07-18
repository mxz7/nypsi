import {
    CommandInteraction,
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    MessageActionRowComponentBuilder,
    ButtonStyle,
    MessageOptions,
    InteractionReplyOptions,
    GuildMember,
    MessageEditOptions,
    Interaction,
} from "discord.js";
import {
    userExists,
    createUser,
    getBalance,
    updateBalance,
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
import * as shuffle from "shuffle-array";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { gamble, logger } from "../utils/logger.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";

const games = new Map();

const cmd = new Command("yablon", "play yablon", Categories.MONEY).setAliases(["yb"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("bet").setDescription("amount to bet").setRequired(true));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    if (!(await userExists(message.member))) await createUser(message.member);

    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            await message.reply(data as InteractionReplyOptions);
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

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("yablon help")
            .addField("usage", `${prefix}yablon <bet>\n${prefix}yablon info`)
            .addField(
                "game rules",
                "in yablon, you start with two cards\nyou must guess if the next card drawn will fall between the previous two\n" +
                    "you get a **1.5**x multiplier if you win"
            )
            .addField(
                "help",
                "**J**ack | value of 11\n**Q**ueen | value of 12\n" + "**K**ing | value of 13\n**A**ce | value of 14\n"
            );

        return send({ embeds: [embed] });
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(
            message.member,
            "yablon works exactly how it would in real life\n" +
                "when you create a game, a full 52 deck is shuffled in a random order\n" +
                "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
                "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/yablon.js#L123)"
        ).setHeader("yablon help");

        return send({ embeds: [embed] });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = await formatBet(args[0], message.member);

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}yablon <bet>`)] });
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
        return send({ embeds: [new ErrorEmbed("you are already playing yablon")] });
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
        deck: shuffle(newDeck, {
            copy: true,
        }),
        cards: [],
        nextCard: "",
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
    newCard(message.member);
    newNextCard(message.member);

    while (
        getValue(games.get(message.member.user.id).cards[0]) == getValue(games.get(message.member.user.id).cards[1]) ||
        invalidCardDistance(message.member)
    ) {
        if (games.get(message.member.user.id).deck.length < 3) {
            games.set(message.member.user.id, {
                bet: games.get(message.member.user.id).bet,
                win: games.get(message.member.user.id).win,
                deck: shuffle(newDeck, {
                    copy: true,
                }),
                cards: [],
                nextCard: "",
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            });
        } else {
            games.set(message.member.user.id, {
                bet: games.get(message.member.user.id).bet,
                win: games.get(message.member.user.id).win,
                deck: games.get(message.member.user.id).deck,
                cards: [],
                nextCard: "",
                id: games.get(message.member.user.id).id,
                voted: games.get(message.member.user.id).voted,
            });
        }
        newCard(message.member);
        newCard(message.member);
        newNextCard(message.member);
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("1️⃣").setLabel("in").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("2️⃣").setLabel("out").setStyle(ButtonStyle.Primary)
    );

    const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("yablon", message.author.avatarURL())
        .addField("cards", getCards(message.member));

    send({ embeds: [embed], components: [row] }).then((m) => {
        playGame(message, m).catch((e) => {
            logger.error(`error occured playing yablon - ${message.author.tag} (${message.author.id})`);
            logger.error(e);
            return message.channel.send({
                embeds: [new ErrorEmbed("an error occured while running - join support server")],
            });
        });
    });
}

cmd.setRun(run);

module.exports = cmd;

function newCard(member: GuildMember) {
    const bet = games.get(member.user.id).bet;
    const win = games.get(member.user.id).win;
    const deck = games.get(member.user.id).deck;
    const cards = games.get(member.user.id).cards;
    const nextCard = games.get(member.user.id).nextCard;
    const id = games.get(member.user.id).id;
    const voted = games.get(member.user.id).voted;

    const choice = deck[0];

    deck.shift();

    cards.push(choice);

    games.set(member.user.id, {
        bet: bet,
        win: win,
        deck: deck,
        cards: cards,
        nextCard: nextCard,
        id: id,
        voted: voted,
    });
}

function newNextCard(member: GuildMember) {
    const deck = games.get(member.user.id).deck;

    const choice = deck[0];

    deck.shift();

    games.set(member.user.id, {
        bet: games.get(member.user.id).bet,
        win: games.get(member.user.id).win,
        deck: deck,
        cards: games.get(member.user.id).cards,
        nextCard: choice,
        id: games.get(member.user.id).id,
        voted: games.get(member.user.id).voted,
    });
}

function getValue(card: string) {
    card = card.toLowerCase();

    if (card.includes("a")) return 14;
    if (card.includes("k")) return 13;
    if (card.includes("q")) return 12;
    if (card.includes("j")) return 11;
    // if (!parseInt(card.split()[0])) return "ERROR"
    return parseInt(card.split("")[0]);
}

function invalidCardDistance(member: GuildMember) {
    const value1 = getValue(games.get(member.user.id).cards[0]);
    const value2 = getValue(games.get(member.user.id).cards[1]);

    const minNeeded = 6;
    const maxAllowed = 7;

    if (value1 > value2) return !(value1 - value2 >= minNeeded) || !(value1 - value2 <= maxAllowed);
    return !(value2 - value1 >= minNeeded) || !(value2 - value1 <= maxAllowed);
}

function equalCards(member: GuildMember) {
    const value1 = getValue(games.get(member.user.id).cards[0]);
    const value2 = getValue(games.get(member.user.id).cards[1]);
    const value3 = getValue(games.get(member.user.id).nextCard);
    if (value3 == value1 || value3 == value2) return true;
    return false;
}

function nextCardInBetween(member: GuildMember) {
    const value1 = getValue(games.get(member.user.id).cards[0]);
    const value2 = getValue(games.get(member.user.id).cards[1]);
    const value3 = getValue(games.get(member.user.id).nextCard);
    let high;
    let low;
    if (value1 > value2) {
        high = value1;
        low = value2;
    } else {
        high = value2;
        low = value1;
    }
    if (low < value3 && value3 < high) return true;
    return false;
}

function getCards(member: GuildMember) {
    const cards = games.get(member.user.id).cards;

    return "| " + cards.join(" | ") + " |";
}

async function playGame(message: Message | (NypsiCommandInteraction & CommandInteraction), m: Message) {
    if (!games.has(message.author.id)) return;

    const bet = games.get(message.member.user.id).bet;
    const nextCard = games.get(message.member.user.id).nextCard;

    const newEmbed = new CustomEmbed(message.member).setHeader("yablon", message.author.avatarURL());

    const edit = async (data: MessageEditOptions) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    const lose = async () => {
        gamble(message.author, "yablon", bet, false, 0);
        await addGamble(message.member, "yablon", false);
        newEmbed.setColor("#e4334f");
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**you lose!!**");
        newEmbed.addField("cards", getCards(message.member));
        newEmbed.addField("drawn card", "| " + nextCard + " |");
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    const win = async () => {
        let winnings = Math.round(bet * 1.5);

        newEmbed.setColor("#5efb8f");
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

            const earnedXp = await calcEarnedXp(message.member, bet);

            if (earnedXp > 0) {
                await updateXp(message.member, (await getXp(message.member)) + earnedXp);
                newEmbed.setFooter({ text: `+${earnedXp}xp` });

                const guild = await getGuildByUser(message.member);

                if (guild) {
                    await addToGuildXP(guild.guildName, earnedXp, message.member);
                }
            }

            newEmbed.setDescription(
                "**bet** $" +
                    bet.toLocaleString() +
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
                    Math.round(bet).toLocaleString() +
                    "\n\n**winner!!**\n**you win** $" +
                    winnings.toLocaleString()
            );
        }
        gamble(message.author, "yablon", bet, true, winnings);
        await addGamble(message.member, "yablon", true);
        newEmbed.addField("cards", getCards(message.member));
        newEmbed.addField("drawn card", "| " + nextCard + " |");
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
        games.delete(message.author.id);
        return edit({ embeds: [newEmbed], components: [] });
    };

    const draw = async () => {
        gamble(message.author, "yablon", bet, true, bet);
        await addGamble(message.member, "yablon", true);
        newEmbed.setColor("#E5FF00");
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString());
        newEmbed.addField("cards", getCards(message.member));
        newEmbed.addField("drawn card", "| " + nextCard + " |");
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

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
            return message.channel.send({ content: message.author.toString() + " yablon game expired" });
        });

    if (fail) return;

    if (reaction == "1️⃣") {
        if (equalCards(message.member)) return draw();
        if (nextCardInBetween(message.member)) return win();
        return lose();
    } else if (reaction == "2️⃣") {
        if (equalCards(message.member)) return draw();
        if (nextCardInBetween(message.member)) return lose();
        return win();
    } else {
        games.delete(message.author.id);
        return m.reactions.removeAll();
    }
}
