import { SudokuDifficulty } from "#generated/prisma";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  createSudokuGame,
  getActiveGame,
  getGameById,
  getUserCoordMode,
} from "../utils/functions/sudoku/game";
import { buildGameMessage } from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-play-again",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    // Look up previous game to reuse difficulty
    const gameId = new URL(interaction.message.embeds[0]?.footer?.iconURL).searchParams.get("id");
    const prevGame = gameId ? await getGameById(gameId) : null;
    const difficulty: SudokuDifficulty = (prevGame?.difficulty as SudokuDifficulty) ?? "easy";

    await interaction.deferReply();

    // If there is somehow still an active game, resume it instead
    const existing = await getActiveGame(interaction.user.id);
    const game = existing ?? (await createSudokuGame(interaction.user.id, difficulty));

    const coordMode = await getUserCoordMode(interaction.user.id);
    const msg = await buildGameMessage(game, coordMode);
    await interaction.editReply(msg);
  },
} as InteractionHandler;
