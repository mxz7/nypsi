import { Chess } from "chess.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  GuildMember,
  Interaction,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageComponentInteraction,
  MessageFlags,
  ModalBuilder,
  ModalMessageModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { nanoid } from "nanoid";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
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
import { createGame, getGambleStats, getGameWins } from "../utils/functions/economy/stats";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member";
import { percentChance } from "../utils/functions/random";
import sleep from "../utils/functions/sleep";
import { escapeFormattingCharacters, formatTime } from "../utils/functions/string";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { getPreferences } from "../utils/functions/users/notifications";
import { addHourlyCommand } from "../utils/handlers/commandhandler";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("chess", "play a chess game or puzzle", "fun").setAliases(["ch"]);

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
    option
      .setName("duel")
      .setDescription("challenge another member to a chess game")
      .addUserOption((user) =>
        user.setName("member").setDescription("member you want to play against").setRequired(true),
      ),
  )
  .addSubcommand((option) =>
    option.setName("stats").setDescription("view your chess puzzle stats"),
  );

const duelRequests = new Set<string>();

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

    if (!(await userExists(message.member))) await createUser(message.member);

    const duelStats = (await getGambleStats(message.member)).find((s) => s.game === "chess_duel");
    const duelWins = duelStats ? await getGameWins(message.member, "chess_duel") : 0;
    const duelLosses = duelStats ? duelStats._count._all - duelWins : 0;

    const embed = new CustomEmbed(message.member);
    embed.setHeader(`${message.author.username}'s chess stats`, message.author.avatarURL());
    embed.setDescription(
      formatChessStatsDisplay(stats) +
        "\n\n**duels**\n" +
        (duelStats
          ? `record: **${duelWins.toLocaleString()}**W - **${duelLosses.toLocaleString()}**L`
          : "you haven't played any chess duels yet.\n\nuse **/chess duel** to start!"),
    );

    return send({ embeds: [embed] });
  } else if (args[0]?.toLowerCase() === "duel") {
    return await handleDuel(message, send, args);
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
    await addCooldown(cmd.name, message.member, 10);

    const puzzle = await getRandomPuzzle({ difficulty: difficulty ?? undefined });

    if (puzzle === "unavailable") {
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
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
  } else {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/chess puzzle [difficulty]** *play a random chess puzzle*\n" +
            `- difficulty: ${CHESS_PUZZLE_DIFFICULTIES.map((d) => `\`${d}\``).join(", ")}\n` +
            "**/chess duel <member>** *challenge someone to a chess game*\n" +
            "**/chess stats** *view your stats*",
        ).setHeader("chess", message.author.avatarURL()),
      ],
    });
  }
}

async function startChessGame(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  puzzle: ChessPuzzle,
  send: SendMessage,
  difficulty?: ChessPuzzleDifficulty,
  replayInteraction?: MessageComponentInteraction,
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

  const solutionDisplay = solution.join(" → ");

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

  const updateEmbed = (opponentTurn: boolean, error?: string) => {
    const difficultyLine = difficulty ? `difficulty: \`\n${difficulty}\`` : "";

    const colorTurn = !opponentTurn ? colorName : colorName === "White" ? "Black" : "White";

    embed.setDescription(
      `**${colorTurn.toLowerCase()} to move**\n\n` +
        `rating: \`${puzzle.rating}\`` +
        difficultyLine +
        (error ? `\n\n**${error}**` : ""),
    );
    embed.setColor(colorTurn === "White" ? "#ffffff" : "#000001");
  };

  updateEmbed(false);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("chess-guess").setLabel("move").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("chess-hint").setLabel("hint").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("chess-end").setLabel("resign").setStyle(ButtonStyle.Danger),
  );

  const replayRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setLabel("play again").setStyle(ButtonStyle.Success).setCustomId("rp"),
  );

  let msg: Message;

  const sendOpts = {
    embeds: [embed],
    components: [row],
    files: [{ attachment: buffer, name: "chess.png" }],
  };

  if (replayInteraction) {
    msg = await replayInteraction
      .update(sendOpts)
      .then((r) => r.fetch())
      .catch(() => replayInteraction.message.edit(sendOpts));
  } else if (message instanceof Message) {
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
    res: ModalMessageModalSubmitInteraction,
  ) => {
    collector.stop("win");
    const solveTimeMs = Math.round(performance.now() - puzzleStartTime);
    addChessSolve(message.author.id, puzzle.rating, solveTimeMs);

    embed
      .setDescription(`**puzzle solved!!**\n\nrating: \`${puzzle.rating}\``)
      .setColor(Constants.EMBED_SUCCESS_COLOR)
      .setFooter({ text: `solved in ${formatTime(solveTimeMs)}` });

    const buffer = await renderBoard(chess, { perspective, lastMove });
    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));

    await res
      .update({
        embeds: [embed.setImage("attachment://chess.png")],
        components: [row, replayRow],
        files: [{ attachment: buffer, name: "chess.png" }],
      })
      .catch(() =>
        msg.edit({
          embeds: [embed.setImage("attachment://chess.png")],
          components: [row, replayRow],
          files: [{ attachment: buffer, name: "chess.png" }],
        }),
      );
  };

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "chess-end") {
      row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));
      embed
        .setDescription(`**game ended**\n\nsolution: \`${solutionDisplay}\``)
        .setColor(Constants.EMBED_FAIL_COLOR)
        .setFooter(null);

      await interaction
        .update({ embeds: [embed], components: [row, replayRow] })
        .catch(() => msg.edit({ embeds: [embed], components: [row, replayRow] }));

      if (difficulty && percentChance(20)) {
        interaction.followUp({
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
      updateEmbed(false, `the piece to move is on ${expectedFrom}`);
      await interaction.update({ embeds: [embed], components: [row] });

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
    if (!res.isFromMessage()) return;

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
      updateEmbed(
        false,
        `\`${input}\` is not a valid or legal move\n\nyou can use [chess notation](https://www.chess.com/terms/chess-notation) or coordinates (e.g \`e2e4\` - e2 moves to e4)`,
      );
      res.update({ embeds: [embed] }).catch(() => msg.edit({ embeds: [embed] }));

      return;
    }

    const expected = solution[moveIndex];
    const expectedNormalized = expected.slice(0, 4) + (expected[4] ?? "");

    if (uci !== expectedNormalized) {
      wrongMoves++;

      updateEmbed(false, `that's not the best move (\`${wrongMoves}/3\`)`);

      if (wrongMoves >= 3) {
        row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));
        embed
          .setDescription(`**failed (3 wrong moves)**\n\nsolution: \`${solutionDisplay}\``)
          .setColor(Constants.EMBED_FAIL_COLOR)
          .setFooter(null);

        res
          .update({ embeds: [embed] })
          .catch(() => msg.edit({ embeds: [embed], components: [row, replayRow] }));
      } else {
        res
          .update({ embeds: [embed] })
          .catch(() => msg.edit({ embeds: [embed], components: [row] }));
      }

      if (wrongMoves >= 3) {
        return collector.stop("strikes");
      }

      return;
    }

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

    await res
      .update({
        embeds: [embed],
        components: [row],
        files: [{ attachment: buffer, name: "chess.png" }],
      })
      .catch(() =>
        msg.edit({
          embeds: [embed],
          components: [row],
          files: [{ attachment: buffer, name: "chess.png" }],
        }),
      );

    await sleep(2000);

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
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    if (reason === "win") {
      await playAgain(msg, message, send, difficulty);
      return;
    }

    await addChessFail(message.author.id);

    if (reason === "time") {
      row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));
      embed
        .setDescription(`**out of time**\n\nsolution: \`${solutionDisplay}\``)
        .setColor(Constants.EMBED_FAIL_COLOR)
        .setFooter(null);

      msg.edit({ embeds: [embed], components: [row, replayRow] }).catch(() => {});
    }

    await playAgain(msg, message, send, difficulty);
  });
}

async function playAgain(
  msg: Message,
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  difficulty?: ChessPuzzleDifficulty,
) {
  const res = await msg
    .awaitMessageComponent({
      filter: (i: Interaction) => i.user.id === message.author.id,
      time: 30_000,
    })
    .catch((): null => {
      msg.edit({ components: [] }).catch(() => {});
      return null;
    });

  if (
    (await redis.get(
      `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
    )) === "t"
  ) {
    if (message.author.id === Constants.OWNER_ID && message instanceof Message) {
      message.react("💀");
    } else {
      await res
        .update({
          embeds: [
            new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
          ],
          components: [],
        })
        .catch(() => {});
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      return;
    }
  }

  if (await redis.get("nypsi:maintenance")) {
    if (
      (await hasAdminPermission(message.member, "bypass-maintenance")) &&
      message instanceof Message
    ) {
      message.react("💀");
    } else {
      await res
        .update({
          embeds: [
            new CustomEmbed(
              message.member,
              "fun & moderation commands are still available to you. maintenance mode only prevents certain commands to prevent loss of progress",
            ).setTitle("⚠️ nypsi is under maintenance"),
          ],
          components: [],
        })
        .catch(() => {});
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
      return;
    }
  }

  addHourlyCommand(message.member);
  await addCooldown(cmd.name, message.member, 10);
  redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);

  logger.info(
    `::cmd ${message.guild.id} ${message.channelId} ${message.author.username}: replaying chess`,
    { userId: message.author.id, guildId: message.guildId, channelId: message.channelId },
  );

  const puzzle = await getRandomPuzzle({ difficulty: difficulty ?? undefined });

  if (puzzle === "unavailable") {
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
    await res
      .update({
        embeds: [
          new ErrorEmbed(
            "chess puzzle service is currently unavailable, please try again shortly\nsupport: https://nypsi.xyz/discord",
          ),
        ],
        components: [],
      })
      .catch(() => {});
    return;
  }

  logger.debug(`chess: ${message.author.id} starting puzzle (replay): ${puzzle.id}`);

  await startChessGame(message, puzzle, send, difficulty, res);
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

async function handleDuel(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!args[1]) {
    return send({
      embeds: [new ErrorEmbed("you must specify a member to challenge")],
    });
  }

  const target = await getMember(message.guild, args.slice(1).join(" "));

  if (!target) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (target.user.id === message.author.id) {
    return send({ embeds: [new ErrorEmbed("you can't challenge yourself")] });
  }

  if (target.user.bot) {
    return send({ embeds: [new ErrorEmbed("you can't challenge a bot")] });
  }

  if (!(await userExists(message.member))) await createUser(message.member);
  if (!(await userExists(target))) await createUser(target);

  if (!(await getPreferences(target)).duelRequests) {
    return send({
      embeds: [new ErrorEmbed(`${target.user.toString()} has duel requests disabled`)],
    });
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you have an active game")] });
  }

  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, target.user.id)) {
    return send({ embeds: [new ErrorEmbed("they have an active game")] });
  }

  if (duelRequests.has(message.author.id)) {
    return send({ embeds: [new ErrorEmbed("you already have a pending duel request")] });
  }

  if (duelRequests.has(target.user.id)) {
    return send({ embeds: [new ErrorEmbed("they already have a pending duel request")] });
  }

  await addCooldown(cmd.name, message.member, 15);
  duelRequests.add(message.author.id);

  const embed = new CustomEmbed(message.member).setHeader("chess duel", message.author.avatarURL());
  embed.setDescription(
    `${escapeFormattingCharacters(message.author.username)} has challenged you to a chess game. do you accept?`,
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger),
  );

  const m = await send({
    embeds: [embed],
    components: [row],
    content: `${target.user.toString()} you have been challenged to a chess game`,
  });

  const filter = (i: Interaction) => i.user.id === target.id;

  const response = await m
    .awaitMessageComponent({ filter, time: 60_000 })
    .then(async (collected) => {
      await collected.deferUpdate().catch(() => {});
      duelRequests.delete(message.author.id);
      return collected.customId;
    })
    .catch(async (): Promise<null> => {
      duelRequests.delete(message.author.id);
      embed.setDescription("chess duel request expired");
      await m.edit({ embeds: [embed], components: [] }).catch(() => {});
      return null;
    });

  if (!response) return;

  if (response !== "y") {
    embed.setDescription("chess duel request denied");
    await m.edit({ embeds: [embed], components: [] }).catch(() => {});
    return;
  }

  // Re-check playing state after accept
  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, message.author.id)) {
    embed.setDescription("the challenger has started another game");
    await m.edit({ embeds: [embed], components: [] }).catch(() => {});
    return;
  }
  if (await redis.sismember(Constants.redis.nypsi.USERS_PLAYING, target.user.id)) {
    embed.setDescription("you have started another game");
    await m.edit({ embeds: [embed], components: [] }).catch(() => {});
    return;
  }

  await m.delete().catch(() => {});

  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, message.author.id);
  await redis.sadd(Constants.redis.nypsi.USERS_PLAYING, target.user.id);

  // Randomly assign colors
  const whitePlayer = Math.random() < 0.5 ? message.member : target;
  const blackPlayer = whitePlayer.id === message.member.id ? target : message.member;

  return startChessDuel(message, send, whitePlayer, blackPlayer);
}

async function startChessDuel(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  whitePlayer: GuildMember,
  blackPlayer: GuildMember,
) {
  const chess = new Chess();

  const getActivePlayer = () => (chess.turn() === "w" ? whitePlayer : blackPlayer);
  const getPerspective = (): "white" | "black" => (chess.turn() === "w" ? "white" : "black");
  const getColorName = () => (chess.turn() === "w" ? "White" : "Black");

  let lastMove: { from: string; to: string } | undefined;

  let buffer = await renderBoard(chess, { perspective: getPerspective(), lastMove });

  const embed = new CustomEmbed(message.member)
    .setHeader(
      `${whitePlayer.user.username} vs ${blackPlayer.user.username}`,
      whitePlayer.user.avatarURL(),
    )
    .setImage("attachment://chess.png");

  const updateEmbed = (error?: string) => {
    const active = getActivePlayer();
    const colorName = getColorName();

    embed.setDescription(
      `**${colorName.toLowerCase()} to move** (${active.user.toString()})\n` +
        `${whitePlayer.user.username} (white) vs ${blackPlayer.user.username} (black)` +
        (error ? `\n\n**${error}**` : ""),
    );
    embed.setColor(colorName === "White" ? "#ffffff" : "#000001");
  };

  updateEmbed();

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("chess-duel-move")
      .setLabel("move")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("chess-duel-resign")
      .setLabel("resign")
      .setStyle(ButtonStyle.Danger),
  );

  const msg =
    message instanceof Message
      ? await send({
          embeds: [embed],
          components: [row],
          files: [{ attachment: buffer, name: "chess.png" }],
        })
      : await message
          .reply({
            embeds: [embed],
            components: [row],
            files: [{ attachment: buffer, name: "chess.png" }],
          })
          .then((m) => m.fetch())
          .catch(() =>
            message
              .editReply({
                embeds: [embed],
                components: [row],
                files: [{ attachment: buffer, name: "chess.png" }],
              })
              .then((m) => m.fetch() as Promise<Message>),
          );

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === whitePlayer.id || i.user.id === blackPlayer.id,
    time: 300_000, // 5 min per move
  });

  const endGame = async (
    result: "checkmate" | "stalemate" | "draw" | "resign" | "timeout",
    winnerId?: string,
  ) => {
    collector.stop("ended");
    row.components.forEach((c) => (c as ButtonBuilder).setDisabled(true));

    const loserId = winnerId
      ? winnerId === whitePlayer.id
        ? blackPlayer.id
        : whitePlayer.id
      : undefined;

    const winnerName = winnerId
      ? (winnerId === whitePlayer.id ? whitePlayer : blackPlayer).user.username
      : undefined;

    let description: string;
    switch (result) {
      case "checkmate":
        description = `**checkmate! ${winnerName} wins!**`;
        embed.setColor(Constants.EMBED_SUCCESS_COLOR);
        break;
      case "resign":
        description = `**${loserId === whitePlayer.id ? whitePlayer.user.username : blackPlayer.user.username} resigned. ${winnerName} wins!**`;
        embed.setColor(Constants.EMBED_SUCCESS_COLOR);
        break;
      case "timeout":
        description = `**${loserId === whitePlayer.id ? whitePlayer.user.username : blackPlayer.user.username} timed out. ${winnerName} wins!**`;
        embed.setColor(Constants.EMBED_SUCCESS_COLOR);
        break;
      case "stalemate":
        description = "**stalemate! it's a draw**";
        embed.setColor("#808080");
        break;
      case "draw":
        description = "**draw!**";
        embed.setColor("#808080");
        break;
    }

    embed.setDescription(
      `${description}\n\n${whitePlayer.user.username} (white) vs ${blackPlayer.user.username} (black)`,
    );

    const finalBuffer = await renderBoard(chess, {
      perspective: winnerId === blackPlayer.id ? "black" : "white",
      lastMove,
    });

    await msg
      .edit({
        embeds: [embed.setImage("attachment://chess.png")],
        components: [row],
        files: [{ attachment: finalBuffer, name: "chess.png" }],
      })
      .catch(() => {});

    // Record stats for both players
    const isDraw = !winnerId;
    const moveHistory = chess.history();
    const outcome = `${moveHistory.length} moves`;

    await createGame({
      userId: whitePlayer.id,
      game: "chess_duel",
      result: isDraw ? "draw" : winnerId === whitePlayer.id ? "win" : "lose",
      bet: 0,
      outcome,
    });

    await createGame({
      userId: blackPlayer.id,
      game: "chess_duel",
      result: isDraw ? "draw" : winnerId === blackPlayer.id ? "win" : "lose",
      bet: 0,
      outcome,
    });

    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, whitePlayer.id);
    await redis.srem(Constants.redis.nypsi.USERS_PLAYING, blackPlayer.id);
  };

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "chess-duel-resign") {
      // Either player can resign
      if (interaction.user.id !== whitePlayer.id && interaction.user.id !== blackPlayer.id) {
        await interaction
          .reply({
            embeds: [new ErrorEmbed("you are not part of this game")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      const winnerId = interaction.user.id === whitePlayer.id ? blackPlayer.id : whitePlayer.id;
      await interaction.deferUpdate().catch(() => {});
      await endGame("resign", winnerId);
      return;
    }

    if (interaction.customId === "chess-duel-move") {
      // Only the active player can move
      const activePlayer = getActivePlayer();

      if (interaction.user.id !== activePlayer.id) {
        if (interaction.user.id === whitePlayer.id || interaction.user.id === blackPlayer.id) {
          await interaction
            .reply({
              embeds: [new ErrorEmbed("it's not your turn")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        } else {
          await interaction
            .reply({
              embeds: [new ErrorEmbed("you are not part of this game")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
        return;
      }

      const modalId = `chess-duel-${nanoid()}`;

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
      if (!res.isFromMessage()) return;

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
      const uci = normalizeToUci(input, chess);

      if (!uci) {
        updateEmbed(
          `\`${input}\` is not a valid or legal move\n\nyou can use [chess notation](https://www.chess.com/terms/chess-notation) or coordinates (e.g \`e2e4\` - e2 moves to e4)`,
        );
        res.update({ embeds: [embed] }).catch(() => msg.edit({ embeds: [embed] }));
        return;
      }

      // Apply the move
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || undefined,
      });

      lastMove = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
      collector.resetTimer();

      // Check game end conditions
      if (chess.isCheckmate()) {
        // The player who just moved wins
        await res.deferUpdate().catch(() => {});
        await endGame("checkmate", activePlayer.id);
        return;
      }

      if (chess.isStalemate()) {
        await res.deferUpdate().catch(() => {});
        await endGame("stalemate");
        return;
      }

      if (chess.isDraw()) {
        await res.deferUpdate().catch(() => {});
        await endGame("draw");
        return;
      }

      // Game continues — render for next player
      buffer = await renderBoard(chess, { perspective: getPerspective(), lastMove });
      updateEmbed();

      await res
        .update({
          embeds: [embed.setImage("attachment://chess.png")],
          components: [row],
          files: [{ attachment: buffer, name: "chess.png" }],
        })
        .catch(() =>
          msg.edit({
            embeds: [embed.setImage("attachment://chess.png")],
            components: [row],
            files: [{ attachment: buffer, name: "chess.png" }],
          }),
        );
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "ended") return; // Already handled

    if (reason === "time") {
      // The player whose turn it is loses
      const activePlayer = getActivePlayer();
      const winnerId = activePlayer.id === whitePlayer.id ? blackPlayer.id : whitePlayer.id;
      await endGame("timeout", winnerId);
    } else {
      // Unknown stop reason — clean up
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, whitePlayer.id);
      await redis.srem(Constants.redis.nypsi.USERS_PLAYING, blackPlayer.id);
    }
  });
}

cmd.setRun(run);

module.exports = cmd;
