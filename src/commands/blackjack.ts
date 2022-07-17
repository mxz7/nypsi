import { CommandInteraction, Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
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

const cmd = new Command("blackjack", "play blackjack", Categories.MONEY).setAliases(["bj", "blowjob"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) =>
    option.setName("bet").setDescription("how much would you like to bet").setRequired(true)
);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (!(await userExists(message.member))) await createUser(message.member);

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

    if (games.has(message.member.user.id)) {
        return send({ embeds: [new ErrorEmbed("you are already playing blackjack")] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member)
            .setHeader("blackjack help")
            .addField("usage", `${prefix}blackjack <bet>\n${prefix}blackjack info`)
            .addField(
                "game rules",
                "in blackjack, the aim is to get **21**, or as close as to **21** as you can get without going over\n" +
                    "the dealer will always stand on or above **17**\n" +
                    "**2**x multiplier for winning, on a draw you receive your bet back\n" +
                    "if your first 2 cards add up to 21, you get a **2.5**x win"
            );

        return send({ embeds: [embed] });
    }

    if (args[0] == "info") {
        const embed = new CustomEmbed(
            message.member,
            "blackjack works exactly how it would in real life\n" +
                "when you create a game, a full 52 deck is shuffled in a random order\n" +
                "for every new card you take, it is taken from the first in the deck (array) and then removed from the deck\n" +
                "view the code for this [here](https://github.com/tekohxd/nypsi/blob/master/commands/blackjack.js#L128)"
        ).setHeader("blackjack help");

        return send({ embeds: [embed] });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = await formatBet(args[0], message.member);

    if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed(`${prefix}blackjack <bet>`)] });
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

    const multi = await getMulti(message.member);

    games.set(message.member.user.id, {
        bet: bet,
        deck: shuffle(newDeck),
        cards: [],
        dealerCards: [],
        id: id,
        first: true,
        dealerPlay: false,
        voted: multi,
    });

    setTimeout(async () => {
        if (games.has(message.author.id)) {
            if (games.get(message.author.id).id == id) {
                games.delete(message.author.id);
                await updateBalance(message.member, (await getBalance(message.member)) + bet);
            }
        }
    }, 180000);

    newDealerCard(message.member);
    newCard(message.member);
    newDealerCard(message.member);
    newCard(message.member);

    const embed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
        .setHeader("blackjack", message.author.avatarURL())
        .addField("dealer", `| ${games.get(message.member.user.id).dealerCards[0]} |`)
        .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");

    let row;

    if ((await getBalance(message.member)) >= bet) {
        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("3️⃣").setLabel("double down").setStyle("SECONDARY")
        );
    } else {
        row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("1️⃣").setLabel("hit").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("2️⃣").setLabel("stand").setStyle(ButtonStyle.Primary)
        );
    }

    send({ embeds: [embed], components: [row] })
        .then((m) => {
            playGame(message, m).catch((e) => {
                logger.error(`error occured playing blackjack - ${message.author.tag} (${message.author.id})`);
                logger.error(e);
                return message.channel.send({
                    embeds: [new ErrorEmbed("an error occured while running - join support server")],
                });
            });
        })
        .catch();
}

cmd.setRun(run);

module.exports = cmd;

function newCard(member) {
    const bet = games.get(member.user.id).bet;
    const deck = games.get(member.user.id).deck;
    const cards = games.get(member.user.id).cards;
    const dealerCards = games.get(member.user.id).dealerCards;
    const id = games.get(member.user.id).id;
    const first = games.get(member.user.id).first;
    const voted = games.get(member.user.id).voted;

    const choice = deck[0];

    deck.shift();

    cards.push(choice);

    games.set(member.user.id, {
        bet: bet,
        deck: deck,
        cards: cards,
        dealerCards: dealerCards,
        id: id,
        first: first,
        dealerPlay: false,
        voted: voted,
    });
}

function newDealerCard(member) {
    const bet = games.get(member.user.id).bet;
    const deck = games.get(member.user.id).deck;
    const cards = games.get(member.user.id).cards;
    const dealerCards = games.get(member.user.id).dealerCards;
    const id = games.get(member.user.id).id;
    const first = games.get(member.user.id).first;
    const voted = games.get(member.user.id).voted;

    const choice = deck[0];

    deck.shift();

    dealerCards.push(choice);

    games.set(member.user.id, {
        bet: bet,
        deck: deck,
        cards: cards,
        dealerCards: dealerCards,
        id: id,
        first: first,
        dealerPlay: false,
        voted: voted,
    });
}

function calcTotal(member) {
    const cards = games.get(member.user.id).cards;

    let total = 0;
    let aces = 0;

    let aceAs11 = false;

    for (let card of cards) {
        card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join();

        if (card.includes("K") || card.includes("Q") || card.includes("J")) {
            total = total + 10;
        } else if (card.includes("A")) {
            aces++;
        } else {
            total = total + parseInt(card);
        }
    }

    for (let i = 0; i < aces; i++) {
        if (total < 11) {
            total += 11;
            aceAs11 = true;
        } else {
            total += 1;
        }
    }

    if (total > 21) {
        if (aceAs11) {
            total -= 10;
        }
    }

    return total;
}

function calcTotalDealer(member) {
    const cards = games.get(member.user.id).dealerCards;

    let total = 0;
    let aces = 0;

    for (let card of cards) {
        card = card.split("♠").join().split("♣").join().split("♥️").join().split("♦").join();

        if (card.includes("K") || card.includes("Q") || card.includes("J")) {
            total = total + 10;
        } else if (card.includes("A")) {
            aces++;
        } else {
            total = total + parseInt(card);
        }
    }

    for (let i = 0; i < aces; i++) {
        if (total < 11) {
            total += 11;
        } else {
            total += 1;
        }
    }

    return total;
}

function getCards(member) {
    const cards = games.get(member.user.id).cards;

    return "| " + cards.join(" | ") + " |";
}

function getDealerCards(member) {
    const cards = games.get(member.user.id).dealerCards;

    return "| " + cards.join(" | ") + " |";
}

/**
 * @param {Message} message
 * @param {Message} m
 */
async function playGame(message, m) {
    if (!games.has(message.author.id)) return;

    const edit = async (data) => {
        if (message.interaction) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    let bet = games.get(message.member.user.id).bet;
    const first = games.get(message.member.user.id).first;
    const dealerPlaya = games.get(message.member.user.id).dealerPlay;

    const newEmbed = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString()).setHeader(
        "blackjack",
        message.author.avatarURL()
    );

    const lose = async () => {
        gamble(message.author, "blackjack", bet, false, 0);
        await addGamble(message.member, "blackjack", false);
        newEmbed.setColor("#e4334f");
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**you lose!!**");
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
        newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    const win = async () => {
        let winnings = bet * 2;

        if (games.get(message.author.id).cards.length == 2 && calcTotal(message.member) == 21) {
            winnings = Math.floor(bet * 2.5);
        }

        newEmbed.setColor("#5efb8f");
        if (games.get(message.member.user.id).voted > 0) {
            winnings = winnings + Math.round(winnings * games.get(message.member.user.id).voted);

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
                "**bet** $" + bet.toLocaleString() + "\n\n**winner!!**\n**you win** $" + winnings.toLocaleString()
            );
        }

        const earnedXp = await calcEarnedXp(message.member, bet);

        if (earnedXp > 0) {
            await updateXp(message.member, (await getXp(message.member)) + earnedXp);
            newEmbed.setFooter(`+${earnedXp}xp`);

            const guild = await getGuildByUser(message.member);

            if (guild) {
                await addToGuildXP(guild.guildName, earnedXp, message.member);
            }
        }

        gamble(message.author, "blackjack", bet, true, winnings);
        await addGamble(message.member, "blackjack", true);

        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
        newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
        await updateBalance(message.member, (await getBalance(message.member)) + winnings);
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    const draw = async () => {
        gamble(message.author, "blackjack", bet, true, bet);
        await addGamble(message.member, "blackjack", true);
        newEmbed.setColor("#E5FF00");
        newEmbed.setDescription("**bet** $" + bet.toLocaleString() + "\n\n**draw!!**\nyou win $" + bet.toLocaleString());
        newEmbed.addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**");
        newEmbed.addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
        await updateBalance(message.member, (await getBalance(message.member)) + bet);
        games.delete(message.author.id);
        return await edit({ embeds: [newEmbed], components: [] });
    };

    if (calcTotalDealer(message.member) > 21) {
        return win();
    } else if (calcTotalDealer(message.member) == 21 && !first && dealerPlaya) {
        return lose();
    } else if (calcTotal(message.member) == 21) {
        return setTimeout(() => {
            dealerPlay(message);

            if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                return draw();
            } else if (calcTotalDealer(message.member) > 21) {
                return win();
            } else if (calcTotalDealer(message.member) == 21) {
                return lose();
            } else if (calcTotal(message.member) == 21) {
                return win();
            } else {
                if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                    return win();
                } else {
                    return lose();
                }
            }
        }, 1500);
    } else if (calcTotal(message.member) > 21) {
        return lose();
    } else {
        games.set(message.member.user.id, {
            bet: bet,
            deck: games.get(message.member.user.id).deck,
            cards: games.get(message.member.user.id).cards,
            dealerCards: games.get(message.member.user.id).dealerCards,
            id: games.get(message.member.user.id).id,
            first: false,
            dealerPlay: false,
            voted: games.get(message.member.user.id).voted,
        });

        const filter = (i) => i.user.id == message.author.id;

        let fail = false;

        const reaction = await m
            .awaitMessageComponent({ filter, time: 30000, errors: ["time"] })
            .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
            })
            .catch(() => {
                fail = true;
                games.delete(message.author.id);
                return message.channel.send({ content: message.author.toString() + " blackjack game expired" });
            });

        if (fail) return;

        if (reaction == "1️⃣") {
            newCard(message.member);

            if (calcTotal(message.member) > 21) {
                return lose();
            }

            const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
                .setHeader("blackjack", message.author.avatarURL())
                .addField("dealer", `| ${games.get(message.member.user.id).dealerCards[0]} |`)
                .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
            await edit({ embeds: [newEmbed1] });

            if (calcTotal(message.member) == 21) {
                return setTimeout(() => {
                    dealerPlay(message);

                    if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                        return draw();
                    } else if (calcTotalDealer(message.member) > 21) {
                        return win();
                    } else if (calcTotalDealer(message.member) == 21) {
                        return lose();
                    } else if (calcTotal(message.member) == 21) {
                        return win();
                    } else {
                        if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                            return win();
                        } else {
                            return lose();
                        }
                    }
                }, 1500);
            }

            return playGame(message, m);
        } else if (reaction == "2️⃣") {
            const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
                .setHeader("blackjack", message.author.avatarURL())
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
            edit({ embeds: [newEmbed1] });

            games.set(message.member.user.id, {
                bet: bet,
                deck: games.get(message.member.user.id).deck,
                cards: games.get(message.member.user.id).cards,
                dealerCards: games.get(message.member.user.id).dealerCards,
                id: games.get(message.member.user.id).id,
                first: false,
                dealerPlay: true,
                voted: games.get(message.member.user.id).voted,
            });

            setTimeout(() => {
                dealerPlay(message);

                if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                    return draw();
                } else if (calcTotalDealer(message.member) > 21) {
                    return win();
                } else if (calcTotalDealer(message.member) == 21) {
                    return lose();
                } else if (calcTotal(message.member) == 21) {
                    return win();
                } else {
                    if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                        return win();
                    } else {
                        return lose();
                    }
                }
            }, 1500);
        } else if (reaction == "3️⃣") {
            await updateBalance(message.member, (await getBalance(message.member)) - bet);

            bet = bet * 2;

            games.set(message.member.user.id, {
                bet: bet,
                deck: games.get(message.member.user.id).deck,
                cards: games.get(message.member.user.id).cards,
                dealerCards: games.get(message.member.user.id).dealerCards,
                id: games.get(message.member.user.id).id,
                first: false,
                dealerPlay: false,
                voted: games.get(message.member.user.id).voted,
            });

            newCard(message.member);

            const newEmbed1 = new CustomEmbed(message.member, "**bet** $" + bet.toLocaleString())
                .setHeader("blackjack", message.author.avatarURL())
                .addField("dealer", getDealerCards(message.member) + " **" + calcTotalDealer(message.member) + "**")
                .addField(message.author.username, getCards(message.member) + " **" + calcTotal(message.member) + "**");
            edit({ embeds: [newEmbed1] });

            if (calcTotal(message.member) > 21) {
                return setTimeout(() => {
                    return lose();
                }, 1500);
            }

            setTimeout(() => {
                dealerPlay(message);

                if (calcTotal(message.member) == calcTotalDealer(message.member)) {
                    return draw();
                } else if (calcTotalDealer(message.member) > 21) {
                    return win();
                } else if (calcTotalDealer(message.member) == 21) {
                    return lose();
                } else if (calcTotal(message.member) == 21) {
                    return win();
                } else {
                    if (calcTotal(message.member) > calcTotalDealer(message.member)) {
                        return win();
                    } else {
                        return lose();
                    }
                }
            }, 1500);
        } else {
            return games.delete(message.author.id);
        }
    }
}

function dealerPlay(message) {
    while (calcTotalDealer(message.member) < 17) {
        newDealerCard(message.member);
    }
    return;
}
