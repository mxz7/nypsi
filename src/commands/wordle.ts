import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
  MessageFlags,
} from "discord.js";
import * as fs from "fs/promises";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addKarma } from "../utils/functions/karma/karma";
import { formatTime } from "../utils/functions/string";
import { getPreferences } from "../utils/functions/users/notifications";
import { getLastKnownAvatar, getLastKnownUsername } from "../utils/functions/users/username";
import { addWordleGame, getWordleGame } from "../utils/functions/users/wordle";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("wordle", "play wordle on discord", "fun").setAliases(["w"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((option) => option.setName("play").setDescription("play a game of wordle"))
  .addSubcommand((option) =>
    option.setName("help").setDescription("view the help menu for wordle"),
  );

interface Game {
  word: string;
  letters: {
    notInWord: string[];
    wrongPosition: string[];
    correct: string[];
  };
  message: Message;
  guesses: string[];
  board: string[][];
  embed: CustomEmbed;
  start: number;
}

type Response = "win" | "continue" | "lose";

const emojis = new Map<string, string>();
const games = new Map<string, Game>();
const karmaCooldown = new Set<string>();

let wordList: string[];
let guessList: string[];

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (games.has(message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you are already playing wordle")] });
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member);

    embed.setHeader("wordle help");
    embed.setDescription(
      [
        "you have 6 attempts to guess the word",
        "",
        "green letters indicate that the letter is in the correct spot",
        "yellow letters indicate that the letter is in the word, but in the wrong spot",
        "grey letters arent in the word at all",
        "",
        "[wordlist](https://github.com/mxz7/nypsi/blob/main/data/wordle.txt)",
        "",
        `**${prefix}wordle play** play a game of wordle`,
        `**${prefix}wordle id <id>** view the result of a game`,
      ].join("\n"),
    );
    embed.setFooter({ text: "type 'stop' to cancel the game when you're playing" });

    return await send({ embeds: [embed] });
  }

  if ((args.length >= 2 && args[0].toLowerCase() == "id") || args[0].toLowerCase() == "result") {
    const game = await getWordleGame(args[1].toLowerCase());
    if (!game)
      return send({
        embeds: [new ErrorEmbed(`could not find game with id \`${args[1].toLowerCase()}\``)],
      });

    const username = (await getPreferences(game.userId))?.leaderboards
      ? await getLastKnownUsername(game.userId, false).catch(() => {})
      : "[hidden]";

    const embed = new CustomEmbed(game.userId).setHeader(
      username ? `${username}'s wordle game` : `id: ${game.id.toString(36)}`,
      username === "[hidden]" ? message.author.avatarURL() : await getLastKnownAvatar(game.userId),
      `https://nypsi.xyz/wordles/${game.id.toString(36)}?ref=bot-wordle`,
    );

    games.set(game.id.toString(36), {
      board: createBoard(),
      embed: new CustomEmbed(),
      guesses: [],
      message: message as Message,
      letters: {
        notInWord: [],
        wrongPosition: [],
        correct: [],
      },
      start: 0,
      word: game.word,
    });

    for (const guess of game.guesses) {
      guessWord(guess, game.id.toString(36));
    }

    embed.setDescription(
      `${renderBoard(games.get(game.id.toString(36)).board, games.get(game.id.toString(36)).letters)}\n\n${game.won ? "won" : "lost"} in ${formatTime(game.time)}${game.won ? "" : `\n\nthe word was ${game.word}`}`,
    );
    games.delete(game.id.toString(36));

    return send({ embeds: [embed] });
  } else if (
    args[0]?.toLowerCase() == "start" ||
    args[0]?.toLowerCase() == "play" ||
    args[0]?.toLowerCase() == "p"
  ) {
    if (await onCooldown(cmd.name, message.member)) {
      const res = await getResponse(cmd.name, message.member);

      if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
      return;
    }

    await addCooldown(cmd.name, message.member, 15);
    await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    const board = createBoard();
    const word = await generateWord();

    const embed = new CustomEmbed(message.member);

    embed.setHeader(`${message.author.username}'s wordle`, message.author.avatarURL());
    embed.setDescription(renderBoard(board));
    embed.setFooter({ text: "type your guess in chat" });

    let fail = false;
    const msg = await send({ embeds: [embed] }).catch(() => {
      fail = true;
    });

    if (fail) return;

    games.set(message.author.id, {
      message: msg as Message,
      word: word,
      letters: {
        notInWord: [],
        wrongPosition: [],
        correct: [],
      },
      guesses: [],
      board: board,
      embed: embed,
      start: performance.now(),
    });

    return play(message);
  } else {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `**${prefix}wordle play** play a game of wordle\n**${prefix}wordle id <id>** view the result of a game`,
        ),
      ],
    });
  }
}

async function play(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
): Promise<void> {
  const m = games.get(message.author.id).message;
  const edit = async (data: MessageEditOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions).catch(() => {
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        games.delete(message.author.id);
        return;
      });
      return await message.fetchReply();
    } else {
      return await m.edit(data).catch(() => {
        redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
        games.delete(message.author.id);
        return;
      });
    }
  };

  const embed = games.get(message.author.id).embed;

  const filter = (m: Message) => m.author.id == message.author.id && !m.content.includes(" ");
  let fail = false;

  const response: any = await message.channel
    .awaitMessages({ filter, max: 1, time: 300_000, errors: ["time"] })
    .then(async (collected) => {
      await collected.first().delete();
      return collected.first().content.toLowerCase();
    })
    .catch(() => {
      fail = true;
      cancel(message, m);
      games.delete(message.author.id);
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      message.channel.send({ content: `${message.author.toString()} wordle game expired` });
    });

  if (fail) return;

  if (!(typeof response == "string")) return;

  if (
    response == "stop" ||
    response == "cancel" ||
    response == "" ||
    response.startsWith((await getPrefix(message.guild))[0])
  ) {
    return cancel(message, m);
  }

  if (response.length != 5) {
    const m = await message.channel.send({
      embeds: [new CustomEmbed(message.member, "guesses must be 5 letter words")],
    });

    setTimeout(() => {
      m.delete();
    }, 2000);
    return play(message);
  } else if (!guessList.includes(response)) {
    const msg = await message.channel.send({
      embeds: [new CustomEmbed(message.member, `\`${response}\` is not in the word list`)],
    });

    setTimeout(() => {
      msg.delete();
    }, 2000);
    return play(message);
  } else if (games.get(message.author.id).guesses.includes(response)) {
    const msg = await message.channel.send({
      embeds: [new CustomEmbed(message.member, `you have already guessed \`${response}\``)],
    });

    setTimeout(() => {
      msg.delete();
    }, 2000);
    return play(message);
  } else {
    const res = guessWord(response, message.author.id);

    embed.setDescription(
      renderBoard(games.get(message.author.id).board, games.get(message.author.id).letters),
    );
    embed.setFooter({ text: "'stop' to end the game" });

    let fail = false;
    await edit({ embeds: [embed] }).catch(() => {
      fail = true;
    });
    if (fail) {
      redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      games.delete(message.author.id);
      return;
    }

    if (res == "continue") {
      return play(message);
    } else if (res == "lose") {
      return lose(message, m);
    } else {
      return win(message, m);
    }
  }
}

async function cancel(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
  const edit = async (data: BaseMessageOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await m.edit(data);
    }
  };

  const game = games.get(message.author.id);

  const embed = game.embed;
  embed.setDescription(
    `${renderBoard(game.board, game.letters)}\n\ngame cancelled. the word was **${game.word}**`,
  );
  embed.setColor(Constants.EMBED_FAIL_COLOR);
  embed.setFooter(null);

  redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  games.delete(message.author.id);

  if (!message.member) {
    return edit({ embeds: [embed] });
  }

  const id = await addWordleGame(
    message.member,
    false,
    game.guesses,
    performance.now() - game.start,
    game.word,
  );

  embed.setFooter({ text: `id: ${id}` });

  edit({ embeds: [embed] });
}

async function win(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
  const edit = async (data: BaseMessageOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await m.edit(data);
    }
  };

  const id = await addWordleGame(
    message.author.id,
    true,
    games.get(message.author.id).guesses,
    performance.now() - games.get(message.author.id).start,
    games.get(message.author.id).word,
  ).catch(() => 0);

  const embed = games.get(message.author.id).embed;
  embed.setDescription(
    `${renderBoard(games.get(message.author.id).board, games.get(message.author.id).letters)}\n\nyou won!! congratulations`,
  );
  embed.setColor(Constants.EMBED_SUCCESS_COLOR);
  embed.setFooter({
    text: `completed in ${formatTime(performance.now() - games.get(message.author.id).start)} | id: ${id}`,
  });

  edit({ embeds: [embed] });
  redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  games.delete(message.author.id);

  if (!karmaCooldown.has(message.author.id)) {
    karmaCooldown.add(message.author.id);

    setTimeout(() => {
      karmaCooldown.delete(message.author.id);
    }, ms("15m"));

    await addKarma(message.member, 5);
  }
}

async function lose(message: Message | (NypsiCommandInteraction & CommandInteraction), m: any) {
  const edit = async (data: BaseMessageOptions) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions);
      return await message.fetchReply();
    } else {
      return await m.edit(data);
    }
  };

  const game = games.get(message.author.id);
  const embed = games.get(message.author.id).embed;
  embed.setDescription(
    `${renderBoard(game.board, game.letters)}\n\nyou lost ): the word was **${game.word}**`,
  );
  embed.setColor(Constants.EMBED_FAIL_COLOR);
  embed.setFooter(null);

  redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  games.delete(message.author.id);

  if (!message.member) {
    return edit({ embeds: [embed] });
  }

  const id = await addWordleGame(
    message.member,
    false,
    game.guesses,
    performance.now() - game.start,
    game.word,
  );

  embed.setFooter({ text: `id: ${id}` });

  edit({ embeds: [embed] });
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

function renderBoard(
  board: string[][],
  letters?: {
    notInWord: string[];
    wrongPosition: string[];
    correct: string[];
  },
): string {
  let description = board.join("\n").replaceAll(",", "");

  const top = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
  const middle = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
  const bottom = ["z", "x", "c", "v", "b", "n", "m"];

  const displayLetters = (row: string[]) => {
    let line = "";
    for (const letter of row) {
      if (letters?.notInWord?.includes(letter)) line += emojis.get(`black-${letter}`);
      else if (letters?.correct?.includes(letter)) line += emojis.get(`green-${letter}`);
      else if (letters?.wrongPosition?.includes(letter)) line += emojis.get(`yellow-${letter}`);
      else line += emojis.get(`grey-${letter}`);
    }
    return line;
  };

  const space = (amount: number) => {
    return "\u00A0".repeat(amount); // non breaking space
  };

  description += `\n\n${displayLetters(top)}\n${space(3)}${displayLetters(middle)}\n${space(9)}${displayLetters(bottom)}`;

  return description;
}

function guessWord(word: string, id: string): Response {
  const game = games.get(id);
  const board = game.board;
  const notInWord = game.letters.notInWord;
  const wrongPosition = game.letters.wrongPosition;
  const correct = game.letters.correct;

  const counts = new Map<string, number>();

  for (let i = 0; i < 5; i++) {
    const letter = word[i];
    const actualLetter = game.word[i];

    let emoji: string;

    if (letter == actualLetter) {
      emoji = emojis.get(`green-${letter}`);
      counts.set(letter, (counts.get(letter) || 0) + 1);
    }

    board[game.guesses.length][i] = emoji;
  }

  for (let i = 0; i < 5; i++) {
    const letter = word[i];
    const actualLetter = game.word[i];
    const letterCount = (game.word.match(new RegExp(letter, "g")) || []).length;

    let emoji: string;

    if (letter == actualLetter) {
      if (!correct.includes(letter)) correct.push(letter);
    } else if (game.word.includes(letter)) {
      if ((counts.get(letter) || 0) >= letterCount) {
        emoji = emojis.get(`grey-${letter}`);
      } else {
        emoji = emojis.get(`yellow-${letter}`);
        counts.set(letter, (counts.get(letter) || 0) + 1);
        if (!wrongPosition.includes(letter)) wrongPosition.push(letter);
      }
    } else {
      if (!notInWord.includes(letter)) notInWord.push(letter);
      emoji = emojis.get(`grey-${letter}`);
    }

    if (emoji) board[game.guesses.length][i] = emoji;
  }

  game.guesses.push(word);

  if (word == game.word) {
    return "win" as Response;
  } else if (game.guesses.length == 6) {
    return "lose" as Response;
  } else {
    return "continue" as Response;
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

emojis.set("black-a", "<:1f1e6:1398187600673636413>");
emojis.set("black-b", "<:1f1e7:1398187644709638209>");
emojis.set("black-c", "<:1f1e8:1398187663793586268>");
emojis.set("black-d", "<:1f1e9:1398187677085470780>");
emojis.set("black-e", "<:1f1ea:1398187690054385704>");
emojis.set("black-f", "<:1f1eb:1398187704771936381>");
emojis.set("black-g", "<:1f1ec:1398187718185320469>");
emojis.set("black-h", "<:1f1ed:1398187754118058045>");
emojis.set("black-i", "<:1f1ee:1398187768361779291>");
emojis.set("black-j", "<:1f1ef:1398187779120431219>");
emojis.set("black-k", "<:1f1f0:1398187792017915914>");
emojis.set("black-l", "<:1f1f1:1398187804504227840>");
emojis.set("black-m", "<:1f1f2:1398187817129082883>");
emojis.set("black-n", "<:1f1f3:1398187852654706912>");
emojis.set("black-o", "<:1f1f4:1398187867850670122>");
emojis.set("black-p", "<:1f1f5:1398187894295887986>");
emojis.set("black-q", "<:1f1f6:1398187907423928442>");
emojis.set("black-r", "<:1f1f7:1398187925719748750>");
emojis.set("black-s", "<:1f1f8:1398187939523199036>");
emojis.set("black-t", "<:1f1f9:1398187959445880984>");
emojis.set("black-u", "<:1f1fa:1398187972695822357>");
emojis.set("black-v", "<:1f1fb:1398187991138172998>");
emojis.set("black-w", "<:1f1fc:1398188007575650397>");
emojis.set("black-x", "<:1f1fd:1398188021567852655>");
emojis.set("black-y", "<:1f1fe:1398188034196897903>");
emojis.set("black-z", "<:1f1ff:1398188061795287070>");

cmd.setRun(run);

module.exports = cmd;

async function generateWord() {
  if (!wordList || !guessList) {
    // remove \r for windows
    wordList = await fs
      .readFile("./data/wordle.txt")
      .then((res) => res.toString().replaceAll("\r", "").split("\n"));
    guessList = (
      await fs
        .readFile("./data/wordle_guesses.txt")
        .then((res) => res.toString().replaceAll("\r", "").split("\n"))
    ).concat(wordList);
  }

  return wordList[Math.floor(Math.random() * wordList.length)];
}
