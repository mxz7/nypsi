import { MessageFlags } from "discord.js";
import { InteractionHandler } from "../types/InteractionHandler";
import { getGameById, getUserCoordMode, resignGame } from "../utils/functions/sudoku/game";
import { buildEndedGameMessage } from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-resign",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const gameId = interaction.message.embeds[0]?.footer?.text;
    if (!gameId) return;

    const game = await getGameById(gameId);
    if (!game || game.state !== "active") {
      return interaction.reply({
        content: "no active sudoku game found",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (game.userId !== interaction.user.id) {
      return interaction.reply({
        content: "this is not your game",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    const [resigned, coordMode] = await Promise.all([
      resignGame(game.id),
      getUserCoordMode(interaction.user.id),
    ]);

    const msg = await buildEndedGameMessage(resigned, coordMode, "resigned");
    await interaction.editReply(msg);
  },
} as InteractionHandler;
