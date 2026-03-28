import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { nanoid } from "nanoid";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { renderBoard } from "../utils/functions/chess/board";
import {
  addChessFail,
  addChessSolve,
  buildChessFromPuzzle,
  CHESS_PUZZLE_DIFFICULTIES,
  ChessPuzzle,
  ChessPuzzleDifficulty,
  getChessStats,
  getRandomPuzzle,
  normalizeToUci,
} from "../utils/functions/chess/puzzle";
import { percentChance } from "../utils/functions/random";
import sleep from "../utils/functions/sleep";
import { formatTime } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("chess", "play a chess puzzle", "fun").setAliases(["ch"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((option) =>
    option
      .setName("puzzle")
      .setDescription("play a random chess puzzle")
      .addStringOption((difficulty) =>
        difficulty
          .setName("difficulty")
          .setDescription("select puzzle difficulty")
          .setRequired(false)
          .addChoices(CHESS_PUZZLE_DIFFICULTIES.map((d) => ({ name: d, value: d }))),
      ),
  )
  .addSubcommand((option) =>
    option.setName("stats").setDescription("view your chess puzzle stats"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);
    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (args[0]?.toLowerCase() === "stats") {
    await addCooldown(cmd.name, message.member, 3);
    const stats = await getChessStats(message.author.id);

    const embed = new CustomEmbed(message.member);
    embed.setHeader(`${message.author.username}'s chess stats`, message.author.avatarURL());
    embed.setDescription(formatChessStatsDisplay(stats));

    return send({ embeds: [embed] });
  } else if (
    ["puzzle", "p", "play", ...CHESS_PUZZLE_DIFFICULTIES].includes(args[0]?.toLowerCase())
  ) {
    if (!["puzzle", "p", "play"].includes(args[0].toLowerCase())) {
      args[1] = args[0];
    }
    const difficulty = parsePuzzleDifficulty(args[1]);

    if (!difficulty && args[1]) {
      return send({
        embeds: [
          new ErrorEmbed(
            `invalid difficulty. use one of: ${CHESS_PUZZLE_DIFFICULTIES.map((d) => `\`${d}\``).join(", ")}`,
          ),
        ],
      });
    }

    if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
      return send({
        embeds: [new ErrorEmbed("you have an active game")],
      });
    }

    await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

    try {
      await addCooldown(cmd.name, message.member, 10);

      const puzzle = await getRandomPuzzle({ difficulty: difficulty ?? undefined });

      if (puzzle === "unavailable") {
        return send({
          embeds: [
            new ErrorEmbed(
              "chess puzzle service is currently unavailable, please try again shortly\nsupport: https://nypsi.xyz/discord",
            ),
          ],
        });
      }

      logger.debug(`chess: ${message.author.id} starting puzzle: ${puzzle.id}`);

      return await startChessGame(message, puzzle, send, difficulty ?? undefined);
    } finally {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    }
  } else {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/chess puzzle [difficulty]** *play a random chess puzzle*\n" +
            `- difficulty: ${CHESS_PUZZLE_DIFFICULTIES.map((d) => `\`${d}\``).join(", ")}\n` +
            "**/chess stats** *view your stats*",
        ).setHeader("chess puzzles", message.author.avatarURL()),
      ],
    });
  }
}

async function startChessGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  puzzle: ChessPuzzle,
  send: SendMessage,
  difficulty?: ChessPuzzleDifficulty,
) {
  const beforeBuild = performance.now();
  const chess = buildChessFromPuzzle(puzzle);
  const afterBuild = performance.now();

  logger.debug(`chess: built chess instance from puzzle in ${afterBuild - beforeBuild}ms`);

  if (chess.isGameOver()) {
    return send({ embeds: [new ErrorEmbed("invalid puzzle data received, please try again")] });
  }

  const solution = puzzle.solution;

  if (solution.length < 1) {
    return send({ embeds: [new ErrorEmbed("invalid puzzle data received, please try again")] });
  }

  const playerColor = chess.turn() as "w" | "b";
  const perspective = playerColor === "w" ? "white" : "black";
  const colorName = playerColor === "w" ? "White" : "Black";

  // moveIndex tracks the next move in the solution array that the player must input.
  // solution[even] = player move, solution[odd] = opponent auto-reply.
  let moveIndex = 0;
  let wrongMoves = 0;

  const lastUci = chess.history({ verbose: true }).slice(-1)[0];
  const lastMove = lastUci ? { from: lastUci.from, to: lastUci.to } : undefined;

  let buffer = await renderBoard(chess, {
    perspective,
    lastMove,
  });

  const embed = new CustomEmbed(message.member)
    .setHeader("chess puzzle", message.author.avatarURL())
    .setImage("attachment://chess.png");

  const updateEmbed = (opponentTurn: boolean) => {
    const difficultyLine = difficulty ? `difficulty: \`${difficulty}\`\n` : "";

    const colorTurn = !opponentTurn ? colorName : colorName === "White" ? "Black" : "White";

    embed.setDescription(
      `**${colorTurn.toLowerCase()} to move**\n\n` +
        `rating: \`${puzzle.rating}\`\n` +
        difficultyLine,
    );
    embed.setColor(colorTurn === "White" ? "#ffffff" : "#000001");
  };

  updateEmbed(false);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("chess-guess").setLabel("move").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("chess-hint").setLabel("hint").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("chess-end").setLabel("resign").setStyle(ButtonStyle.Danger),
  );

  let msg: Message;

  const sendOpts = {
    embeds: [embed],
    components: [row],
    files: [{ attachment: buffer, name: "chess.png" }],
  };

  if (message instanceof Message) {
    msg = await message.channel.send(sendOpts);
  } else {
    msg = await message
      .reply(sendOpts)
      .then((m) => m.fetch())
      .catch(() => message.editReply(sendOpts).then((m) => m.fetch() as Promise<Message>));
  }

  const puzzleStartTime = performance.now();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === message.author.id,
    time: 300_000,
  });

  const handleWin = async (
    lastMove: { from: string; to: string },
    res: { deferUpdate: () => Promise<unknown> },
  ) => {
    await res.deferUpdate().catch(() => {});
    collector.stop("win");
    const solveTimeMs = Math.round(performance.now() - puzzleStartTime);
    addChessSolve(message.author.id, puzzle.rating, solveTimeMs);

    embed
      .setDescription(`**puzzle solved!!**\n\nrating: \`${puzzle.rating}\``)
      .setColor(Constants.EMBED_SUCCESS_COLOR)
      .setFooter({ text: `solved in ${formatTime(solveTimeMs)}` });

    const buffer = await renderBoard(chess, { perspective, lastMove });
    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));
    await msg
      .edit({
        embeds: [embed.setImage("attachment://chess.png")],
        components: [row],
        files: [{ attachment: buffer, name: "chess.png" }],
      })
      .catch(() => {});
  };

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "chess-end") {
      if (difficulty || percentChance(80)) {
        await interaction.deferUpdate();
      } else {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [
            new CustomEmbed(
              message.member,
              "too hard? try setting a difficulty with /chess puzzle <difficulty>",
            ),
          ],
        });
      }
      return collector.stop("cancelled");
    }

    if (interaction.customId === "chess-hint") {
      // Remove hint button so it can only be used once
      const hintIdx = row.components.findIndex((c) => {
        const b = c as ButtonBuilder;
        return (b.data as { custom_id?: string }).custom_id === "chess-hint";
      });
      if (hintIdx !== -1) row.components.splice(hintIdx, 1);

      const expectedFrom = solution[moveIndex].slice(0, 2);
      await interaction.update({ embeds: [embed], components: [row] });
      await interaction
        .followUp({
          embeds: [new CustomEmbed(message.member, `the piece to move is on **${expectedFrom}**`)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    // chess-guess: show modal
    const modalId = `chess-guess-${nanoid()}`;

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle("enter your move")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("move")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("move")
              .setRequired(true)
              .setPlaceholder("e.g. e2e4  or  Nf3")
              .setStyle(TextInputStyle.Short),
          ),
      );

    await interaction.showModal(modal);

    const res = await interaction
      .awaitModalSubmit({
        time: 300_000,
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
      })
      .catch((): null => null);

    if (!res || !res.isModalSubmit()) return;

    if (collector.ended) {
      res
        .reply({
          embeds: [new ErrorEmbed("this game has already ended")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    const input = res.fields.getTextInputValue("move");

    logger.debug(`chess: received move "${res.fields.getTextInputValue("move")}"`);

    const uci = normalizeToUci(input, chess);

    if (!uci) {
      res
        .reply({
          embeds: [new ErrorEmbed(`\`${input}\` is not a valid or legal move, try again`)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    const expected = solution[moveIndex];
    const expectedNormalized = expected.slice(0, 4) + (expected[4] ?? "");

    if (uci !== expectedNormalized) {
      wrongMoves++;

      await res
        .reply({
          embeds: [new ErrorEmbed(`that's not the best move, try again (\`${wrongMoves}/3\`)`)],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});

      if (wrongMoves >= 3) {
        return collector.stop("strikes");
      }

      return;
    }

    await res.deferUpdate().catch(() => {});

    // Correct move — apply it
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    moveIndex++;

    const playerLastMove = { from: uci.slice(0, 2), to: uci.slice(2, 4) };

    if (moveIndex >= solution.length) {
      await handleWin(playerLastMove, res);
      return;
    }

    buffer = await renderBoard(chess, { perspective, lastMove: playerLastMove });

    updateEmbed(true);
    embed.setImage("attachment://chess.png");

    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));

    await msg.edit({
      embeds: [embed],
      components: [row],
      files: [{ attachment: buffer, name: "chess.png" }],
    });

    await sleep(3000);

    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(false));

    // Auto-play opponent reply
    const opponentUci = solution[moveIndex];
    chess.move({
      from: opponentUci.slice(0, 2),
      to: opponentUci.slice(2, 4),
      promotion: opponentUci[4] || undefined,
    });
    moveIndex++;

    const opponentLastMove = {
      from: opponentUci.slice(0, 2),
      to: opponentUci.slice(2, 4),
    };

    if (moveIndex >= solution.length) {
      // Puzzle solved after opponent's final auto-move
      await handleWin(opponentLastMove, res);
      return;
    }

    buffer = await renderBoard(chess, { perspective, lastMove: opponentLastMove });
    updateEmbed(false);
    await msg
      .edit({
        embeds: [embed.setImage("attachment://chess.png")],
        components: [row],
        files: [{ attachment: buffer, name: "chess.png" }],
      })
      .catch(() => {});
  });

  collector.on("end", async (_, reason) => {
    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));

    if (reason === "win") return; // already handled above

    await addChessFail(message.author.id);

    const solutionDisplay = solution.join(" → ");

    if (reason === "cancelled") {
      embed
        .setDescription(`**game ended**\n\nsolution: \`${solutionDisplay}\``)
        .setColor(Constants.EMBED_FAIL_COLOR)
        .setFooter(null);
    } else if (reason === "strikes") {
      embed
        .setDescription(`**failed (3 wrong moves)**\n\nsolution: \`${solutionDisplay}\``)
        .setColor(Constants.EMBED_FAIL_COLOR)
        .setFooter(null);
    } else {
      // time
      embed
        .setDescription(`**out of time**\n\nsolution: \`${solutionDisplay}\``)
        .setColor(Constants.EMBED_FAIL_COLOR)
        .setFooter(null);
    }

    await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
  });
}

function parsePuzzleDifficulty(value?: string): ChessPuzzleDifficulty | null {
  const requested = value?.toLowerCase();
  if (!requested) return null;

  if (CHESS_PUZZLE_DIFFICULTIES.includes(requested as ChessPuzzleDifficulty)) {
    return requested as ChessPuzzleDifficulty;
  }

  return null;
}

function formatChessStatsDisplay(stats: Awaited<ReturnType<typeof getChessStats>> | null): string {
  if (!stats || (stats.solved === 0 && stats.failed === 0)) {
    return "you haven't played any chess puzzles yet.\n\nuse **/chess puzzle** to start!";
  }

  const total = stats.solved + stats.failed;
  const pct = total > 0 ? ((stats.solved / total) * 100).toFixed(1) : "0.0";

  const lines =
    `puzzles solved: **${stats.solved.toLocaleString()}** / **${total.toLocaleString()}** (${pct}%)\n` +
    `avg winning rating: **${Math.round(stats.averageWinningRating).toLocaleString()}**\n` +
    `current streak: **${stats.streak.toLocaleString()}**\n` +
    `best streak: **${stats.bestStreak.toLocaleString()}**`;

  const timeLines =
    (stats.fastestSolve != null ? `\nfastest solve: **${formatTime(stats.fastestSolve)}**` : "") +
    (stats.averageSolveTime != null
      ? `\navg solve time: **${formatTime(stats.averageSolveTime)}**`
      : "");

  return lines + timeLines;
}

cmd.setRun(run);

module.exports = cmd;
