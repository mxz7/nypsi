import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  LabelBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import { createHelpChat, getAiChatConversationById } from "../utils/functions/ai/help-chat";

async function showQuestionModal(interaction: ButtonInteraction) {
  const id = `help-ai-question-${Math.floor(Math.random() * 10_000_000)}`;
  const modal = new ModalBuilder().setCustomId(id).setTitle("ask nypsi");

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("what do you need help with?")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("question")
          .setPlaceholder("ask a question about nypsi commands, features, or how something works")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(4)
          .setMaxLength(1000)
          .setRequired(true),
      ),
  );

  await interaction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.user.id === interaction.user.id && i.customId === id;

  return await interaction.awaitModalSubmit({ filter, time: 300000 }).catch(() => {});
}

function buildResponseMessage(
  userId: string,
  conversationId: string,
  question: string,
  response: string,
  icon?: string,
) {
  const embed = new CustomEmbed(userId)
    .setHeader("nypsi help", icon)
    .addField("your question", question)
    .addField("answer", response)
    .setFooter({
      text: "this service is powered by AI and can make mistakes",
      iconURL: `https://nypsi.xyz/wiki?conversationid=${conversationId}`,
    });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("help-ai-continue")
      .setLabel("ask another question")
      .setStyle(ButtonStyle.Primary),
  );

  return { embed, row };
}

export default {
  name: "help-ai-continue",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const footerIcon = interaction.message.embeds.at(0)?.footer?.iconURL;
    const parsedFooterIcon = new URL(footerIcon || "");
    const sourceConversationId = parsedFooterIcon.searchParams.get("conversationid") || "";

    if (!sourceConversationId) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("this help chat can no longer be continued")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sourceConversation = await getAiChatConversationById(sourceConversationId);

    if (!sourceConversation) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("this help chat can no longer be continued")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sourceConversation.userId !== interaction.user.id) {
      return await interaction.reply({
        embeds: [new ErrorEmbed("only the user who started this help chat can continue it")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const modalSubmit = await showQuestionModal(interaction);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const question = modalSubmit.fields.getTextInputValue("question").trim();
    const result = await createHelpChat(modalSubmit.user.id, question, sourceConversation.id);

    if (!result.aiResponse) {
      return await modalSubmit.editReply({
        embeds: [new ErrorEmbed("failed to get an ai answer, please try again")],
      });
    }

    const message = buildResponseMessage(
      modalSubmit.user.id,
      result.conversationId,
      question,
      result.aiResponse,
      interaction.client.user.avatarURL(),
    );

    await modalSubmit.editReply({
      embeds: [message.embed],
      components: [message.row],
    });
  },
} as InteractionHandler;
