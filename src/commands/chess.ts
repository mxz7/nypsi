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
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { renderBoard } from "../utils/functions/chess/board";
import {
  addChessFail,
  addChessSolve,
  buildChessFromPuzzle,
  CHESS_PUZZLE_DIFFICULTIES,
  ChessPuzzleDifficulty,
  getChessStats,
  getRandomPuzzle,
  LichessPuzzle,
  normalizeToUci,
} from "../utils/functions/chess/puzzle";
import sleep from "../utils/functions/sleep";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("chess", "play a chess puzzle", "fun").setAliases(["puzzle"]);

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
          .addChoices(
            { name: "easiest", value: "easiest" },
            { name: "easier", value: "easier" },
            { name: "normal", value: "normal" },
            { name: "harder", value: "harder" },
            { name: "hardest", value: "hardest" },
          ),
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

  if (args.length === 0 || (args[0] !== "puzzle" && args[0] !== "p" && args[0] !== "stats")) {
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

  if (args[0] === "stats") {
    await addCooldown(cmd.name, message.member, 3);
    const stats = await getChessStats(message.author.id);

    const embed = new CustomEmbed(message.member);
    embed.setHeader(`${message.author.username}'s chess stats`, message.author.avatarURL());
    embed.setDescription(formatChessStatsDisplay(stats));

    return send({ embeds: [embed] });
  }

  // /chess puzzle
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

  await addCooldown(cmd.name, message.member, 10);

  const puzzle = await getRandomPuzzle({ difficulty: difficulty ?? undefined });

  if (puzzle === "unavailable") {
    return send({
      embeds: [new ErrorEmbed("lichess is currently unavailable, please try again shortly")],
    });
  }

  return startChessGame(message, puzzle, send, difficulty ?? undefined);
}

async function startChessGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  puzzle: LichessPuzzle,
  send: SendMessage,
  difficulty?: ChessPuzzleDifficulty,
) {
  const beforeBuild = performance.now();
  const chess = buildChessFromPuzzle(puzzle);
  const afterBuild = performance.now();

  logger.debug(`chess: built chess instance from puzzle in ${afterBuild - beforeBuild}ms`);

  if (chess.history().length < 1) {
    return send({ embeds: [new ErrorEmbed("invalid puzzle data received, please try again")] });
  }

  const solution = puzzle.puzzle.solution;
  const playerColor = chess.turn() as "w" | "b";
  const perspective = playerColor === "w" ? "white" : "black";
  const colorName = playerColor === "w" ? "White" : "Black";

  // moveIndex tracks the next move in the solution array that the player must input.
  // solution[even] = player move, solution[odd] = opponent auto-reply.
  let moveIndex = 0;

  const lastUci = chess.history({ verbose: true }).slice(-1)[0];

  let buffer = await renderBoard(chess, {
    perspective,
    lastMove: { from: lastUci.from, to: lastUci.to },
  });

  const embed = new CustomEmbed(message.member)
    .setHeader("chess puzzle", message.author.avatarURL())
    .setImage("attachment://chess.png");

  const updateEmbedDescription = (opponentTurn: boolean) => {
    embed.setDescription(
      `**${(!opponentTurn ? colorName : colorName === "White" ? "Black" : "White").toLowerCase()} to move**\n\n` +
        `rating: \`${puzzle.puzzle.rating}\`\n` +
        `difficulty: \`${difficulty ?? "normal"}\`\n` +
        `themes: ${puzzle.puzzle.themes
          .slice(0, 3)
          .map((t) => `\`${t}\``)
          .join(", ")}`,
    );
  };

  updateEmbedDescription(false);

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
    await addChessSolve(message.author.id, puzzle.puzzle.rating);
    const stats = await getChessStats(message.author.id);

    embed
      .setDescription(
        `**puzzle solved!!**\n\nrating: \`${puzzle.puzzle.rating}\`\n\n${formatChessStatsDisplay(stats)}`,
      )
      .setColor(Constants.EMBED_SUCCESS_COLOR)
      .setFooter(null);

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
      await interaction.deferUpdate().catch(() => {});
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
      res
        .reply({
          embeds: [new ErrorEmbed("that's not the best move, try again")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
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

    updateEmbedDescription(true);
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
    updateEmbedDescription(false);
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

  return (
    `puzzles solved: **${stats.solved.toLocaleString()}** / **${total.toLocaleString()}** (${pct}%)\n` +
    `avg winning rating: **${Math.round(stats.averageWinningRating).toLocaleString()}**\n` +
    `current streak: **${stats.streak.toLocaleString()}**\n` +
    `best streak: **${stats.bestStreak.toLocaleString()}**`
  );
}

cmd.setRun(run);

module.exports = cmd;
