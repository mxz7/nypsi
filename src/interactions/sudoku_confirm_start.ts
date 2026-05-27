import { MessageFlags } from "discord.js";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  createSudokuGame,
  getUserCoordMode,
  SudokuCoordMode,
  SudokuDifficulty,
} from "../utils/functions/sudoku/game";
import { buildGameMessage, FIELD_DIFFICULTY, FIELD_MODE } from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-confirm-start",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const fields = interaction.message.embeds[0]?.fields ?? [];
    const difficulty = fields.find((f) => f.name === FIELD_DIFFICULTY)?.value as SudokuDifficulty;
    const coordMode = fields.find((f) => f.name === FIELD_MODE)?.value as SudokuCoordMode;

    if (!difficulty || !coordMode) {
      return interaction.reply({
        content: "could not read game state from message",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    const game = await createSudokuGame(interaction.user.id, difficulty);
    const userCoordMode = await getUserCoordMode(interaction.user.id);
    const message = await buildGameMessage(game, userCoordMode);
    await interaction.editReply(message);
  },
} as InteractionHandler;
