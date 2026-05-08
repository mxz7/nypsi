import {
  ButtonInteraction,
  LabelBuilder,
  Message,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  buildHelpPageEmbed,
  createHelpChat,
  createHelpPageRows,
  extractConversationIdFromEmbed,
  HelpChatPage,
  preparePagesFromConversation,
} from "../utils/functions/ai/help-chat";
import PageManager from "../utils/functions/page";

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
  conversationId: string,
  icon: string | undefined,
  handleContinueQuestion: (
    manager: PageManager<HelpChatPage>,
    btnInteraction: ButtonInteraction,
  ) => Promise<void>,
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
  const embed = buildHelpPageEmbed(userId, conversationId, initialPage, icon, lastPage, lastPage);

  const manager = new PageManager<HelpChatPage>({
    message,
    pages,
    row: rows,
    userId,
    embed,
    updateEmbed: (page, currentEmbed) => {
      const current = page?.[0];
      if (!current) return currentEmbed;

      return buildHelpPageEmbed(userId, conversationId, current, icon, 1, 1);
    },
    onPageUpdate: (pageManager) => {
      const current = pageManager.pages.get(pageManager.currentPage)?.[0];

      if (!current) {
        return pageManager.embed;
      }

      return buildHelpPageEmbed(
        userId,
        conversationId,
        current,
        icon,
        pageManager.currentPage,
        pageManager.lastPage,
      );
    },
    handleResponses: new Map([["help-ai-continue", handleContinueQuestion]]),
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
    const result = await createHelpChat(modalSubmit.user.id, question);

    if (!result.aiResponse) {
      return await modalSubmit.editReply({
        embeds: [new ErrorEmbed("failed to get an ai answer, please try again")],
      });
    }

    const icon = interaction.client.user.avatarURL() || undefined;

    const initialSetup = await setupHelpChatPageManager(
      (await modalSubmit.fetchReply()) as Message,
      modalSubmit.user.id,
      result.conversationId,
      icon,
      handleContinueQuestion,
    );

    if (!initialSetup) {
      return await modalSubmit.editReply({
        embeds: [new ErrorEmbed("failed to build help chat pages, please try again")],
      });
    }

    const { manager, embed, rows } = initialSetup;

    await modalSubmit.editReply({
      embeds: [embed],
      components: rows,
    });

    void manager.listen();
  },
} as InteractionHandler;

async function handleContinueQuestion(
  manager: PageManager<HelpChatPage>,
  btnInteraction: ButtonInteraction,
): Promise<void> {
  const footerIcon = btnInteraction.message.embeds.at(0)?.footer?.iconURL;
  const conversationData = await extractConversationIdFromEmbed(footerIcon);

  if (!conversationData) {
    await btnInteraction
      .reply({
        embeds: [new ErrorEmbed("this help chat can no longer be continued")],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const { conversationId, conversation } = conversationData;

  if (conversation.userId !== btnInteraction.user.id) {
    await btnInteraction
      .reply({
        embeds: [new ErrorEmbed("only the user who started this help chat can continue it")],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const newModalSubmit = await showQuestionModal(btnInteraction);

  if (!newModalSubmit) return;

  await newModalSubmit.deferUpdate();

  const newQuestion = newModalSubmit.fields.getTextInputValue("question").trim();
  const newResult = await createHelpChat(btnInteraction.user.id, newQuestion, conversationId);

  if (!newResult.aiResponse) {
    await newModalSubmit
      .followUp({
        embeds: [new ErrorEmbed("failed to get an ai answer, please try again")],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const icon = btnInteraction.client.user.avatarURL() || undefined;

  const newSetup = await setupHelpChatPageManager(
    manager.message,
    btnInteraction.user.id,
    newResult.conversationId,
    icon,
    handleContinueQuestion,
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

  const { manager: newManager, embed: newEmbed, rows: newRows } = newSetup;

  await manager.message.edit({
    embeds: [newEmbed],
    components: newRows,
  });

  void newManager.listen();
}
