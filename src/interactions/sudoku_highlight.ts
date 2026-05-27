import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { coordToIndex, getGameById, getUserCoordMode } from "../utils/functions/sudoku/game";
import { buildGameMessage } from "../utils/functions/sudoku/ui";

export default {
  name: "sudoku-highlight",
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
      .setTitle("highlight cell")
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

    const cellInput = res.fields.getTextInputValue("cell").trim().toUpperCase();
    const crosshair = coordToIndex(cellInput, coordMode);

    if (crosshair === null) {
      return res.reply({ content: "invalid coordinate", flags: MessageFlags.Ephemeral });
    }

    const msg = await buildGameMessage(
      game,
      coordMode,
      interaction.user.avatarURL(),
      undefined,
      undefined,
      crosshair,
    );
    return res.update({ ...msg, content: "" });
  },
} as InteractionHandler;
