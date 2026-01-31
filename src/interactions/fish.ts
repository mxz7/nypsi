import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiCommandInteraction } from "../models/Command";
import { InteractionHandler } from "../types/InteractionHandler";
import { isLockedOut } from "../utils/functions/captcha";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { runCommand } from "../utils/handlers/commandhandler";

export default {
  name: "fish",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;
    if ((await isEcoBanned(interaction.user.id)).banned) return;
    if (!interaction.channel.permissionsFor(interaction.user.id).has("SendMessages")) return;

    const int = interaction as unknown as NypsiCommandInteraction;

    int.author = interaction.user;
    int.commandName = "fish";

    setTimeout(() => {
      if (interaction.isRepliable()) {
        interaction.deferReply().catch(() => {});
      }
    }, 2500);

    runCommand("fish", int, []);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("fish").setLabel("fish").setStyle(ButtonStyle.Success),
    );

    const existingRow = interaction.message.components[0];

    if (await isLockedOut(interaction.user.id)) {
      if (
        existingRow.data.type === ComponentType.ActionRow &&
        // @ts-expect-error the type is lying
        existingRow.components.length > 1
      ) {
        // already has button
        return;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("captcha")
          .setLabel("you must complete a captcha")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
          .setEmoji("⚠️"),
      );

      interaction.message.edit({ components: [row] });
    } else {
      if (
        existingRow.data.type === ComponentType.ActionRow &&
        // @ts-expect-error the type is lying
        existingRow.components.length === 1
      ) {
        // doesn't have captcha warning
        return;
      }

      interaction.message.edit({ components: [row] });
    }
  },
} as InteractionHandler;
