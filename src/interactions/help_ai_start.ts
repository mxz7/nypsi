import {
  ButtonBuilder,
  ButtonInteraction,
  ComponentType,
  LabelBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalMessageModalSubmitInteraction,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  buildCannotAnswerEmbed,
  buildHelpPageEmbed,
  buildRateLimitedEmbed,
  createCannotAnswerRows,
  createHelpChat,
  createHelpPageRows,
  HelpChatPage,
  preparePagesFromConversation,
} from "../utils/functions/ai/help-chat";
import PageManager from "../utils/functions/page";
import { openSupportRequest } from "../utils/functions/supportrequest";

async function listenForSupportRequest(message: Message, userId: string, client: NypsiClient) {
  const res = await message
    .awaitMessageComponent({
      filter: (i) => i.user.id === userId,
      time: 300000,
      componentType: ComponentType.Button,
    })
    .catch(() => {});

  if (!res) {
    const rows = createCannotAnswerRows();
    for (const row of rows) {
      for (const component of row.components) {
        if (component instanceof ButtonBuilder) component.setDisabled(true);
      }
    }
    await message.edit({ components: rows }).catch(() => {});
    return;
  }

  await openSupportRequest(res, client);
}

async function showQuestionModal(interaction: ButtonInteraction) {
  const id = `help-ai-question-${Math.floor(Math.random() * 10_000_000)}`;
  const modal = new ModalBuilder().setCustomId(id).setTitle("ask nypsi help ai");

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

async function setupHelpChatPageManager(
  message: Message,
  userId: string,
  conversationId: number,
  icon: string | undefined,
) {
  const pagesData = await preparePagesFromConversation(conversationId);

  if (!pagesData) {
    return null;
  }

  const { pages, lastPage } = pagesData;
  const initialPage = pages.get(lastPage)?.[0];

  if (!initialPage) {
    return null;
  }

  const rows = createHelpPageRows(lastPage <= 1);
  const embed = buildHelpPageEmbed(userId, initialPage, icon, lastPage, lastPage);

  const handleContinue = async (
    manager: PageManager<HelpChatPage>,
    btnInteraction: ButtonInteraction,
  ): Promise<void> => {
    const newModalSubmit = await showQuestionModal(btnInteraction);

    if (!newModalSubmit || !newModalSubmit.isFromMessage()) return;

    const newQuestion = newModalSubmit.fields.getTextInputValue("question").trim();
    const thinkingEmbed = new CustomEmbed(btnInteraction.user.id)
      .setHeader("nypsi help", icon)
      .addField("your question", newQuestion)
      .addField("answer", "*thinking...*");

    await (newModalSubmit as ModalMessageModalSubmitInteraction).update({
      embeds: [thinkingEmbed],
      components: createHelpPageRows(true, true),
    });

    const newResult = await createHelpChat(btnInteraction.user.id, newQuestion, conversationId);

    if (newResult.rateLimited) {
      await manager.message.edit({
        embeds: [buildRateLimitedEmbed(btnInteraction.user.id, icon)],
        components: createCannotAnswerRows(),
      });
      void listenForSupportRequest(
        manager.message,
        btnInteraction.user.id,
        btnInteraction.client as NypsiClient,
      );
      return;
    }

    if (!newResult.canAnswer) {
      await manager.message.edit({
        embeds: [buildCannotAnswerEmbed(btnInteraction.user.id, icon)],
        components: createCannotAnswerRows(),
      });
      void listenForSupportRequest(
        manager.message,
        btnInteraction.user.id,
        btnInteraction.client as NypsiClient,
      );
      return;
    }

    const newSetup = await setupHelpChatPageManager(
      manager.message,
      btnInteraction.user.id,
      conversationId,
      icon,
    );

    if (!newSetup) {
      await newModalSubmit
        .followUp({
          embeds: [new ErrorEmbed("failed to build help chat pages, please try again")],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    await manager.message.edit({
      embeds: [newSetup.embed],
      components: newSetup.rows,
    });

    void newSetup.manager.listen();
  };

  const manager = new PageManager<HelpChatPage>({
    message,
    pages,
    row: rows,
    userId,
    embed,
    updateEmbed: (page, currentEmbed) => {
      const current = page?.[0];
      if (!current) return currentEmbed;

      return buildHelpPageEmbed(userId, current, icon, 1, 1);
    },
    onPageUpdate: (pageManager) => {
      const current = pageManager.pages.get(pageManager.currentPage)?.[0];

      if (!current) {
        return pageManager.embed;
      }

      return buildHelpPageEmbed(
        userId,
        current,
        icon,
        pageManager.currentPage,
        pageManager.lastPage,
      );
    },
    handleResponses: new Map([["help-ai-continue", handleContinue]]),
  });

  manager.currentPage = manager.lastPage;

  return { manager, embed, rows };
}

export default {
  name: "help-ai-start",
  type: "interaction",
  async run(interaction) {
    if (!interaction.isButton()) return;

    const modalSubmit = await showQuestionModal(interaction);

    if (!modalSubmit) return;

    await modalSubmit.deferReply();

    const question = modalSubmit.fields.getTextInputValue("question").trim();
    const icon = interaction.client.user.avatarURL() || undefined;

    const thinkingEmbed = new CustomEmbed(modalSubmit.user.id)
      .setHeader("nypsi help", icon)
      .addField("your question", question)
      .addField("answer", "*thinking...*");

    await modalSubmit.editReply({
      embeds: [thinkingEmbed],
      components: createHelpPageRows(true, true),
    });

    const message = (await modalSubmit.fetchReply()) as Message;
    const result = await createHelpChat(modalSubmit.user.id, question);

    if (result.rateLimited) {
      await modalSubmit.editReply({
        embeds: [buildRateLimitedEmbed(modalSubmit.user.id, icon)],
        components: createCannotAnswerRows(),
      });
      void listenForSupportRequest(message, modalSubmit.user.id, interaction.client as NypsiClient);
      return;
    }

    if (!result.canAnswer) {
      await modalSubmit.editReply({
        embeds: [buildCannotAnswerEmbed(modalSubmit.user.id, icon)],
        components: createCannotAnswerRows(),
      });
      void listenForSupportRequest(message, modalSubmit.user.id, interaction.client as NypsiClient);
      return;
    }

    const setup = await setupHelpChatPageManager(
      message,
      modalSubmit.user.id,
      result.conversationId,
      icon,
    );

    if (!setup) {
      return await modalSubmit.editReply({
        embeds: [new ErrorEmbed("failed to build help chat pages, please try again")],
      });
    }

    await modalSubmit.editReply({
      embeds: [setup.embed],
      components: setup.rows,
    });

    void setup.manager.listen();
  },
} as InteractionHandler;
