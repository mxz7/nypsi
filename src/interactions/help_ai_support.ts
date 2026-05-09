import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import Constants from "../utils/Constants";
import {
  createSupportRequest,
  getSupportRequest,
  isRequestSuitable,
  sendToRequestChannel,
} from "../utils/functions/supportrequest";

export default {
  name: "help-ai-support",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    if (await getSupportRequest(userId)) {
      return interaction.reply({
        embeds: [new ErrorEmbed("you already have an open support request")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (await redis.exists(`${Constants.redis.cooldown.SUPPORT}:${userId}`)) {
      return interaction.reply({
        embeds: [
          new ErrorEmbed(
            `you have created a support request recently, try again later.\nif you need support and don't want to wait, you can join the nypsi support server [here](${Constants.NYPSI_SERVER_INVITE_LINK})`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = `help-ai-support-modal-${Math.floor(Math.random() * 10_000_000)}`;

    const modal = new ModalBuilder().setCustomId(id).setTitle("nypsi support request");

    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("message")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("ticket_message")
            .setPlaceholder("what do you need help with?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(15)
            .setMaxLength(300),
        ),
    );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) => i.user.id === userId && i.customId === id;

    const modalSubmit = await interaction
      .awaitModalSubmit({ filter, time: 300000 })
      .catch(() => {});

    if (!modalSubmit) return;

    await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

    const helpMessage = modalSubmit.fields.getTextInputValue("ticket_message");

    if (await getSupportRequest(userId)) {
      return modalSubmit.editReply({
        embeds: [new ErrorEmbed("you already have an open support request")],
      });
    }

    const aiResponse = await isRequestSuitable(userId, helpMessage);

    if (!aiResponse.decision) {
      return modalSubmit.editReply({
        embeds: [
          new CustomEmbed()
            .setDescription(
              "this isn't suitable for a support request. try including more information about what you need help with",
            )
            .setFooter({ text: "this is an automated system, please let us know of any issues" }),
        ],
      });
    }

    const r = await createSupportRequest(
      userId,
      interaction.client as NypsiClient,
      interaction.user.username,
    );

    if (!r) {
      return modalSubmit.editReply({
        embeds: [new CustomEmbed().setDescription("failed to create support request")],
      });
    }

    const embed = new CustomEmbed()
      .setHeader(interaction.user.username, interaction.user.avatarURL())
      .setColor("#111111")
      .setDescription(helpMessage);

    await sendToRequestChannel(userId, embed, userId, interaction.client as NypsiClient);

    await modalSubmit.editReply({
      embeds: [
        new CustomEmbed().setDescription(
          "✅ created support request, anything you send to the bot via DM while this is open will be sent directly to nypsi staff",
        ),
      ],
    });
  },
} as InteractionHandler;
