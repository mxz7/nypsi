import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { SudokuCoordMode, SudokuDifficulty } from "#generated/prisma";
import { CustomEmbed } from "../../../models/EmbedBuilders";
import Constants from "../../Constants";
import { renderBoard } from "./board";

type GameBoard = {
  puzzle: string;
  solution: string;
  board: string;
};

type ActiveGame = GameBoard & {
  id: string;
  difficulty: SudokuDifficulty;
  mistakes: number;
};

type EndedGame = ActiveGame & {
  startedAt: Date;
  completedAt: Date | null;
};

function modeLabel(mode: SudokuCoordMode): string {
  return mode === "box" ? "box (A–I boxes, 1–9 cells)" : "coordinates (A–I column, 1–9 row)";
}

function modeToggleLabel(mode: SudokuCoordMode): string {
  return mode === "box" ? "switch to coordinates" : "switch to box";
}

export function buildConfirmationMessage(
  difficulty: SudokuDifficulty,
  coordMode: SudokuCoordMode,
  avatarUrl: string,
) {
  const embed = new CustomEmbed()
    .setHeader("sudoku", avatarUrl)
    .setDescription(
      `**difficulty:** ${difficulty}\n**coordinate mode:** ${modeLabel(coordMode)}\n\n` +
        `fill the 9×9 grid so every row, column, and 3×3 box contains the digits 1–9.\n\n` +
        `use **make move** to enter a cell coordinate and digit. enter \`0\` as the digit to erase a cell.`,
    );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sudoku-confirm-start")
      .setLabel("play")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("sudoku-coord-toggle")
      .setLabel(modeToggleLabel(coordMode))
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

export async function buildGameMessage(
  game: ActiveGame,
  coordMode: SudokuCoordMode,
  avatarUrl: string,
  highlight?: number,
  lastCell?: number,
) {
  const board = await renderBoard(game, coordMode, highlight, lastCell);
  const attachment = new AttachmentBuilder(board, { name: "sudoku.png" });

  const totalCells = game.puzzle.split("").filter((c) => c === "-").length;
  const correctCells = game.board
    .split("")
    .filter((c, i) => game.puzzle[i] === "-" && c === game.solution[i]).length;
  const completionPct = totalCells === 0 ? 100 : (correctCells / totalCells) * 100;

  const embed = new CustomEmbed()
    .setHeader("sudoku", `${avatarUrl}?sudokuGameId=${game.id}`)
    .setDescription(
      `difficulty: \`${game.difficulty}\`\nmistakes: \`${game.mistakes}\`\ncompletion: \`${completionPct.toFixed(1)}%\``,
    )
    .setImage("attachment://sudoku.png");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sudoku-move")
      .setLabel("make move")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("sudoku-resign")
      .setLabel("resign")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], files: [attachment], components: [row] };
}

export async function buildEndedGameMessage(
  game: EndedGame,
  coordMode: SudokuCoordMode,
  reason: "completed" | "resigned",
  avatarUrl: string,
) {
  const board = await renderBoard(game, coordMode);
  const attachment = new AttachmentBuilder(board, { name: "sudoku.png" });

  let desc: string;
  let color: ColorResolvable;

  if (reason === "completed") {
    const elapsed = game.completedAt ? game.completedAt.getTime() - game.startedAt.getTime() : 0;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.round((elapsed % 60000) / 1000);
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    desc = `**puzzle solved!**\ndifficulty: \`${game.difficulty}\`\nmistakes: \`${game.mistakes}\`\ntime: \`${timeStr}\``;
    color = Constants.EMBED_SUCCESS_COLOR;
  } else {
    desc = `**game resigned**\ndifficulty: \`${game.difficulty}\`\nmistakes: \`${game.mistakes}\``;
    color = Constants.EMBED_FAIL_COLOR;
  }

  const embed = new CustomEmbed()
    .setHeader("sudoku", `${avatarUrl}?sudokuGameId=${game.id}`)
    .setDescription(desc)
    .setImage("attachment://sudoku.png");

  if (color) embed.setColor(color);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sudoku-play-again")
      .setLabel("play again")
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], files: [attachment], components: [row] };
}
