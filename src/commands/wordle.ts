import { CommandInteraction, Message, MessageEmbed } from "discord.js";
import ms = require("ms");
import fetch from "node-fetch";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { MStoTime } from "../utils/functions/date";
import { getPrefix } from "../utils/guilds/utils";
import { addKarma } from "../utils/karma/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { addWordleGame, getWordleStats } from "../utils/users/utils";

const cmd = new Command("wordle", "play wordle on discord", Categories.FUN).setAliases(["w"]);

cmd.slashEnabled = true;
cmd.slashData
    .addSubcommand((option) => option.setName("play").setDescription("play a game of wordle"))
    .addSubcommand((option) => option.setName("stats").setDescription("view your stats for wordle"))
    .addSubcommand((option) => option.setName("help").setDescription("view the help menu for wordle"));

interface Game {
    word: string;
    notInWord: string[];
    message: Message;
    guesses: string[];
    board: string[][];
    embed: MessageEmbed | CustomEmbed;
    start: number;
}

enum Response {
    WIN,
    CONTINUE,
    LOSE,
}

const emojis: Map<string, string> = new Map();
const games: Map<string, Game> = new Map();
const karmaCooldown: Set<string> = new Set();

let wordList: string[];

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data) => {
        if (!(message instanceof Message)) {
            await message.reply(data).catch();
            const replyMsg = await message.fetchReply().catch();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data).catch();
        }
    };

    if (games.has(message.author.id)) {
        return send({ embeds: [new ErrorEmbed("you are already playing wordle")] });
    }

    if (args.length == 0) {
        const embed = new CustomEmbed(message.member, false);

        embed.setHeader("wordle help");
        embed.setDescription(
            `you have 6 attempts to guess the word\n\ngreen letters indicate that the letter is in the correct spot\nyellow letters indicate that the letter is in the word, but in the wrong spot\ngrey letters arent in the word at all\n\n**${getPrefix(
                message.guild
            )}wordle play**`
        );
        embed.setFooter("type 'stop' to cancel the game when you're playing");

        return await send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() == "stats") {
        const stats = getWordleStats(message.member);

        if (!stats) {
            return send({ embeds: [new ErrorEmbed("you have no wordle stats")] });
        }

        const embed = new CustomEmbed(message.member, false).setHeader(
            `${message.author.username}'s wordle stats`,
            message.author.avatarURL()
        );

        let desc = "";

        if (stats.win1) desc += `:green_square: **${stats.win1.toLocaleString()}**\n`;
        if (stats.win2) desc += `<:solid_grey:987046773157691452>:green_square: **${stats.win2.toLocaleString()}**\n`;
        if (stats.win3)
            desc += `<:solid_grey:987046773157691452><:solid_grey:987046773157691452>:green_square: **${stats.win3.toLocaleString()}**\n`;
        if (stats.win4)
            desc += `<:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452>:green_square: **${stats.win4.toLocaleString()}**\n`;
        if (stats.win5)
            desc += `<:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452>:green_square: **${stats.win5.toLocaleString()}**\n`;
        if (stats.win6)
            desc += `<:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452><:solid_grey:987046773157691452>:green_square: **${stats.win6.toLocaleString()}**\n`;
        if (stats.lose) desc += `:red_square: **${stats.lose.toLocaleString()}**\n`;

        embed.setDescription(desc);

        if (stats.history.length > 2) {
            const average = stats.history.reduce((a, b) => Number(a) + Number(b)) / stats.history.length;

            embed.setFooter(`average length of winning game: ${MStoTime(average)}`);
        }

        return send({ embeds: [embed] });
    }

    if (args[0].toLowerCase() != "start" && args[0].toLowerCase() != "play" && args[0].toLowerCase() != "p") {
        return send({ embeds: [new ErrorEmbed(`${getPrefix(message.guild)}wordle play`)] });
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    await addCooldown(cmd.name, message.member, 90);

    const board = createBoard();
    const word = getWord();

    const embed = new CustomEmbed(message.member, false);

    embed.setHeader(`${message.author.username}'s wordle`, message.author.avatarURL());
    embed.setDescription(renderBoard(board));
    embed.setFooter("type your guess in chat");

    const msg = await send({ embeds: [embed] });

    games.set(message.author.id, {
        message: msg,
        word: word,
        notInWord: [],
        guesses: [],
        board: board,
        embed: embed,
        start: Date.now(),
    });

    return play(message);
}

async function play(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    const m = games.get(message.author.id).message;
    if (m.deleted) {
        games.delete(message.author.id);
        return;
    }
    const edit = async (data) => {
        if (!(message instanceof Message)) {
            await message.editReply(data).catch(() => {
                games.delete(message.author.id);
                return;
            });
            return await message.fetchReply();
        } else {
            return await m.edit(data).catch(() => {
                games.delete(message.author.id);
                return;
            });
        }
    };

    const embed = games.get(message.author.id).embed;

    const filter = (m) => m.author.id == message.author.id && !m.content.includes(" ");
    let fail = false;

    const response: any = await message.channel
        .awaitMessages({ filter, max: 1, time: 90000, errors: ["time"] })
        .then(async (collected) => {
            await collected.first().delete();
            return collected.first().content.toLowerCase();
        })
        .catch(() => {
            fail = true;
            cancel(message, m);
            games.delete(message.author.id);
            return message.channel.send({ content: message.author.toString() + " wordle game expired" });
        });

    if (fail) return;

    if (!(typeof response == "string")) return;

    if (response == "stop" || response == "cancel" || response == "" || response.startsWith(getPrefix(message.guild))) {
        return cancel(message, m);
    }

    if (response.length != 5) {
        const m = await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, "guesses must be 5 letter words")],
        });

        setTimeout(() => {
            m.delete();
        }, 2000);
        return play(message);
    } else if (!wordList.includes(response)) {
        const msg = await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `\`${response}\` is not in the word list`)],
        });

        setTimeout(() => {
            msg.delete();
        }, 2000);
        return play(message);
    } else if (games.get(message.author.id).guesses.includes(response)) {
        const msg = await message.channel.send({
            embeds: [new CustomEmbed(message.member, false, `you have already guessed \`${response}\``)],
        });

        setTimeout(() => {
            msg.delete();
        }, 2000);
        return play(message);
    } else {
        const res = guessWord(response, message.author.id);

        embed.setDescription(renderBoard(games.get(message.author.id).board));
        embed.setFooter("'stop' to end the game");

        if (games.get(message.author.id).notInWord.length > 0) {
            embed.fields[0] = {
                name: "letters not in wordle",
                value: `~~${games.get(message.author.id).notInWord.join("~~ ~~")}~~`,
                inline: false,
            };
        }

        await edit({ embeds: [embed] });

        if (res == Response.CONTINUE) {
            return play(message);
        } else if (res == Response.LOSE) {
            return lose(message, m);
        } else {
            return win(message, m);
        }
    }
}

async function cancel(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
    const edit = async (data) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    const embed = games.get(message.author.id).embed;
    embed.setDescription(
        `${renderBoard(games.get(message.author.id).board)}\n\n` +
            `game cancelled. the word was **${games.get(message.author.id).word}**`
    );
    embed.setColor("#e4334f");
    embed.setFooter(null);

    edit({ embeds: [embed] });
    games.delete(message.author.id);

    if (!message.member) return;
    addWordleGame(message.member, false);
}

async function win(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
    const edit = async (data) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    addWordleGame(
        message.member,
        true,
        games.get(message.author.id).guesses.length,
        Date.now() - games.get(message.author.id).start
    );

    const embed = games.get(message.author.id).embed;
    embed.setDescription(`${renderBoard(games.get(message.author.id).board)}\n\n` + "you won!! congratulations");
    embed.setColor("#5efb8f");
    embed.setFooter(`completed in ${MStoTime(Date.now() - games.get(message.author.id).start)}`);

    edit({ embeds: [embed] });
    games.delete(message.author.id);

    if (!karmaCooldown.has(message.author.id)) {
        karmaCooldown.add(message.author.id);

        setTimeout(() => {
            karmaCooldown.delete(message.author.id);
        }, ms("15m"));

        await addKarma(message.author.id, 5);
    }
}

async function lose(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
    const edit = async (data) => {
        if (!(message instanceof Message)) {
            await message.editReply(data);
            return await message.fetchReply();
        } else {
            return await m.edit(data);
        }
    };

    const embed = games.get(message.author.id).embed;
    embed.setDescription(
        `${renderBoard(games.get(message.author.id).board)}\n\n` +
            `you lost ): the word was **${games.get(message.author.id).word}**`
    );
    embed.setColor("#e4334f");
    embed.setFooter(null);

    edit({ embeds: [embed] });
    games.delete(message.author.id);

    if (!message.member) return;
    addWordleGame(message.member, false);
}

function createBoard(): string[][] {
    const board = [];

    for (let c = 0; c < 6; c++) {
        board[c] = [];
        for (let r = 0; r < 5; r++) {
            board[c][r] = "<:spacer:971524938139852870>";
        }
    }

    return board;
}

function renderBoard(board: string[][]): string {
    return board.join("\n").replaceAll(",", "");
}

function guessWord(word: string, id: string): Response {
    const game = games.get(id);
    const board = game.board;
    const notInWord = game.notInWord;

    const copy = (" " + game.word).slice(1).split("");

    for (let i = 0; i < 5; i++) {
        const letter = word[i];
        const actualLetter = game.word[i];

        let emoji: string;

        if (letter == actualLetter) {
            copy[i] = "";
            emoji = emojis.get(`green-${letter}`);
        } else if (game.word.includes(letter)) {
            const index = copy.indexOf(letter);
            if (index == -1) {
                emoji = emojis.get(`grey-${letter}`);
            } else {
                emoji = emojis.get(`yellow-${letter}`);
                copy[index] = "";
            }
        } else {
            if (!notInWord.includes(letter)) notInWord.push(letter);
            emoji = emojis.get(`grey-${letter}`);
        }

        board[game.guesses.length][i] = emoji;
    }

    if (word == game.word) {
        return Response.WIN;
    } else if (game.guesses.length == 5) {
        return Response.LOSE;
    } else {
        game.guesses.push(word);
        return Response.CONTINUE;
    }
}

emojis.set("green-a", "<:1f1e6:971480503314178139>");
emojis.set("green-b", "<:1f1e7:971480503750377502>");
emojis.set("green-c", "<:1f1e8:971480503800725554>");
emojis.set("green-d", "<:1f1e9:971480503913947166>");
emojis.set("green-e", "<:1f1ea:971480503825858590>");
emojis.set("green-f", "<:1f1eb:971480503792316436>");
emojis.set("green-g", "<:1f1ec:971480504039772210>");
emojis.set("green-h", "<:1f1ed:971480503758774282>");
emojis.set("green-i", "<:1f1ee:971480503792324638>");
emojis.set("green-j", "<:1f1ef:971480503754567770>");
emojis.set("green-k", "<:1f1f0:971480503821697074>");
emojis.set("green-l", "<:1f1f1:971480503884587179>");
emojis.set("green-m", "<:1f1f2:971480503863636028>");
emojis.set("green-n", "<:1f1f3:971480503611949137>");
emojis.set("green-o", "<:1f1f4:971480503817469993>");
emojis.set("green-p", "<:1f1f5:971480503834263602>");
emojis.set("green-q", "<:__:971480504081735760>");
emojis.set("green-r", "<:1f1f7:971480503884607519>");
emojis.set("green-s", "<:1f1f8:971480503939129404>");
emojis.set("green-t", "<:1f1f9:971480503704252438>");
emojis.set("green-u", "<:1f1fa:971480503867826236>");
emojis.set("green-v", "<:1f1fb:971480503901356072>");
emojis.set("green-w", "<:1f1fc:971480503863627896>");
emojis.set("green-x", "<:1f1fd:971480503918157834>");
emojis.set("green-y", "<:1f1fe:971480504031395921>");
emojis.set("green-z", "<:1f1ff:971480503972692060>");

emojis.set("yellow-a", "<:1f1e6:971480844818608189>");
emojis.set("yellow-b", "<:1f1e7:971480844474667059>");
emojis.set("yellow-c", "<:1f1e8:971480844751474748>");
emojis.set("yellow-d", "<:1f1e9:971480844977987584>");
emojis.set("yellow-e", "<:1f1ea:971480844797640784>");
emojis.set("yellow-f", "<:1f1eb:971480844768260166>");
emojis.set("yellow-g", "<:1f1ec:971480844688564236>");
emojis.set("yellow-h", "<:1f1ed:971480844768247865>");
emojis.set("yellow-i", "<:1f1ee:971480844860555374>");
emojis.set("yellow-j", "<:1f1ef:971480845108015195>");
emojis.set("yellow-k", "<:1f1f0:971480844818583553>");
emojis.set("yellow-l", "<:1f1f1:971480844801818725>");
emojis.set("yellow-m", "<:1f1f2:971480844583731211>");
emojis.set("yellow-n", "<:1f1f3:971480844898295918>");
emojis.set("yellow-o", "<:1f1f4:971480844843769927>");
emojis.set("yellow-p", "<:1f1f5:971480844483051591>");
emojis.set("yellow-q", "<:1f1f6:971480844826968104>");
emojis.set("yellow-r", "<:1f1f7:971480844814389268>");
emojis.set("yellow-s", "<:1f1f8:971480844852133938>");
emojis.set("yellow-t", "<:1f1f9:971480844910866442>");
emojis.set("yellow-u", "<:1f1fa:971480844902469682>");
emojis.set("yellow-v", "<:1f1fb:971480844982165524>");
emojis.set("yellow-w", "<:1f1fc:971480845057687582>");
emojis.set("yellow-x", "<:1f1fd:971480844810190929>");
emojis.set("yellow-y", "<:1f1fe:971480844839551017>");
emojis.set("yellow-z", "<:1f1ff:971480844915060776>");

emojis.set("grey-a", "<:1f1e6:971480936304758814>");
emojis.set("grey-b", "<:1f1e7:971480936246018048>");
emojis.set("grey-c", "<:1f1e8:971480935851765761>");
emojis.set("grey-d", "<:1f1e9:971480936506097764>");
emojis.set("grey-e", "<:1f1ea:971480936279576596>");
emojis.set("grey-f", "<:1f1eb:971480936246026280>");
emojis.set("grey-g", "<:1f1ec:971480936246050826>");
emojis.set("grey-h", "<:1f1ed:971480936241840128>");
emojis.set("grey-i", "<:1f1ee:971480935876943965>");
emojis.set("grey-j", "<:1f1ef:971480936342515762>");
emojis.set("grey-k", "<:1f1f0:971480936283799592>");
emojis.set("grey-l", "<:1f1f1:971480936317329458>");
emojis.set("grey-m", "<:1f1f2:971480936296382534>");
emojis.set("grey-n", "<:1f1f3:971480936266993674>");
emojis.set("grey-o", "<:1f1f4:971480936275390524>");
emojis.set("grey-p", "<:1f1f5:971480935973421097>");
emojis.set("grey-q", "<:1f1f6:971480936417984522>");
emojis.set("grey-r", "<:1f1f7:971480936275390514>");
emojis.set("grey-s", "<:1f1f8:971480936581562478>");
emojis.set("grey-t", "<:1f1f9:971480936246030376>");
emojis.set("grey-u", "<:1f1fa:971480936560599060>");
emojis.set("grey-v", "<:1f1fb:971480936275406848>");
emojis.set("grey-w", "<:1f1fc:971480936279605279>");
emojis.set("grey-x", "<:1f1fd:971480936342503444>");
emojis.set("grey-y", "<:1f1fe:971480936279593011>");
emojis.set("grey-z", "<:1f1ff:971480936380248144>");

cmd.setRun(run);

module.exports = cmd;

function getWord(): string {
    return wordList[Math.floor(Math.random() * wordList.length)];
}

// prettier-ignore
(async () => {
    const res = await fetch(
        "https://gist.githubusercontent.com/cfreshman/a7b776506c73284511034e63af1017ee/raw/845966807347a7b857d53294525263408be967ce/wordle-nyt-answers-alphabetical.txt"
    );

    const body = await res.text();

    const words = body.split("\n");

    wordList = words;
})();
