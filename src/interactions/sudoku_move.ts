import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  applyMove,
  eraseCell,
  getGameById,
  getUserCoordMode,
} from "../utils/functions/sudoku/game";
import { buildEndedGameMessage, buildGameMessage } from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-move",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const gameId = new URL(interaction.message.embeds[0]?.author?.iconURL).searchParams.get(
      "sudokuGameId",
    );
    if (!gameId) return;

    const game = await getGameById(gameId);
    if (!game || game.state !== "active") {
      return interaction.reply({
        embeds: [new ErrorEmbed("no active sudoku game found")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (game.userId !== interaction.user.id) {
      return interaction.reply({
        embeds: [new ErrorEmbed("this is not your game")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const coordMode = await getUserCoordMode(interaction.user.id);
    const cellPlaceholder =
      coordMode === "box" ? "e.g. A5 (box A, cell 5)" : "e.g. C3 (column C, row 3)";

    const modalId = crypto.randomUUID();

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle("sudoku move")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("cell coordinate")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("cell")
              .setRequired(true)
              .setPlaceholder(cellPlaceholder)
              .setMinLength(2)
              .setMaxLength(2)
              .setStyle(TextInputStyle.Short),
          ),
        new LabelBuilder()
          .setLabel("digit (1–9, or 0 to erase)")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("digit")
              .setRequired(true)
              .setPlaceholder("1–9, or 0 to erase")
              .setMinLength(1)
              .setMaxLength(1)
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

    // Re-fetch game in case another interaction modified it
    const freshGame = await getGameById(gameId);
    if (!freshGame || freshGame.state !== "active") {
      return res.reply({ content: "this game has already ended", flags: MessageFlags.Ephemeral });
    }

    const cellInput = res.fields.getTextInputValue("cell").trim().toUpperCase();
    const digitRaw = res.fields.getTextInputValue("digit").trim();
    const digit = parseInt(digitRaw, 10);

    if (isNaN(digit) || digit < 0 || digit > 9) {
      return res.reply({ content: "digit must be 0-9 (0 = erase)", flags: MessageFlags.Ephemeral });
    }

    let result: Awaited<ReturnType<typeof applyMove | typeof eraseCell>>;

    if (digit === 0) {
      result = await eraseCell(freshGame, cellInput, coordMode);
    } else {
      result = await applyMove(freshGame, cellInput, digit, coordMode);
    }

    if ("invalid" in result && result.invalid) {
      return res.reply({ content: result.invalid, flags: MessageFlags.Ephemeral });
    }

    // Fetch updated game state
    const updatedGame = await getGameById(gameId);
    if (!updatedGame) return;

    const highlight = digit === 0 ? null : digit;

    if ("complete" in result && result.complete) {
      const msg = await buildEndedGameMessage(
        updatedGame,
        coordMode,
        "completed",
        interaction.user.avatarURL(),
      );
      return res.update({ ...msg, content: "" });
    }

    const msg = await buildGameMessage(
      updatedGame,
      coordMode,
      interaction.user.avatarURL(),
      highlight,
    );
    return res.update({ ...msg, content: "" });
  },
} as InteractionHandler;
