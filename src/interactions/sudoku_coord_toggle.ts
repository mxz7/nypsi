import { MessageFlags } from "discord.js";
import { InteractionHandler } from "../types/InteractionHandler";
import { setUserCoordMode, SudokuCoordMode } from "../utils/functions/sudoku/game";
import {
  buildConfirmationMessage,
  FIELD_DIFFICULTY,
  FIELD_MODE,
} from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-coord-toggle",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const fields = interaction.message.embeds[0]?.fields ?? [];
    const difficulty = fields.find((f) => f.name === FIELD_DIFFICULTY)?.value as any;
    const currentMode = fields.find((f) => f.name === FIELD_MODE)?.value as SudokuCoordMode;

    if (!difficulty || !currentMode) {
      return interaction.reply({
        embeds: [],
        content: "could not read game state from message",
        flags: MessageFlags.Ephemeral,
      });
    }

    const newMode: SudokuCoordMode = currentMode === "box" ? "coordinates" : "box";

    await setUserCoordMode(interaction.user.id, newMode);

    await interaction.update(buildConfirmationMessage(difficulty, newMode));
  },
} as InteractionHandler;
