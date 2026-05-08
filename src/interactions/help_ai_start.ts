import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  LabelBuilder,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { InteractionHandler } from "../types/InteractionHandler";
import {
  createHelpChat,
  getAiChatConversationById,
  getAiChatConversationMessages,
} from "../utils/functions/ai/help-chat";
import PageManager from "../utils/functions/page";

type HelpChatPage = {
  userQuery: string;
  aiResponse: string;
};

function createHelpPageRows(singlePage = false) {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (!singlePage) {
    rows.push(PageManager.defaultRow(false));
  }

  rows.push(
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help-ai-continue")
        .setLabel("ask another question")
        .setStyle(ButtonStyle.Primary),
    ),
  );

  return rows;
}

function buildHelpPageEmbed(
  userId: string,
  conversationId: string,
  page: HelpChatPage,
  icon: string,
  pageNumber: number,
  lastPage: number,
) {
  return new CustomEmbed(userId)
    .setHeader("nypsi help", icon)
    .addField("your question", page.userQuery)
    .addField("answer", page.aiResponse)
    .setFooter({
      text: `this service is powered by AI and can make mistakes • page ${pageNumber}/${lastPage}`,
      iconURL: `https://nypsi.xyz/wiki?conversationid=${conversationId}`,
    });
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

    const pagesData = await getAiChatConversationMessages(result.conversationId);

    const pages = PageManager.createPages<HelpChatPage>(
      pagesData.map((i) => ({ userQuery: i.userQuery, aiResponse: i.aiResponse as string })),
      1,
    );

    const lastPage = pages.size;
    const initialPage = pages.get(lastPage)?.[0];

    if (!initialPage) {
      return await modalSubmit.editReply({
        embeds: [new ErrorEmbed("failed to build help chat pages, please try again")],
      });
    }

    const icon = interaction.client.user.avatarURL() || undefined;
    const rows = createHelpPageRows(lastPage <= 1);
    const embed = buildHelpPageEmbed(
      modalSubmit.user.id,
      result.conversationId,
      initialPage,
      icon,
      lastPage,
      lastPage,
    );

    await modalSubmit.editReply({
      embeds: [embed],
      components: rows,
    });

    const message = (await modalSubmit.fetchReply()) as Message;

    const handleContinueQuestion = async (
      manager: PageManager<HelpChatPage>,
      btnInteraction: ButtonInteraction,
    ): Promise<void> => {
      // Extract conversation ID from embed footer
      const footerIcon = btnInteraction.message.embeds.at(0)?.footer?.iconURL;
      const parsedFooterIcon = new URL(footerIcon || "");
      const sourceConversationId = parsedFooterIcon.searchParams.get("conversationid") || "";

      if (!sourceConversationId) {
        await btnInteraction
          .reply({
            embeds: [new ErrorEmbed("this help chat can no longer be continued")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      const sourceConversation = await getAiChatConversationById(sourceConversationId);

      if (!sourceConversation) {
        await btnInteraction
          .reply({
            embeds: [new ErrorEmbed("this help chat can no longer be continued")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      if (sourceConversation.userId !== btnInteraction.user.id) {
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
      const newResult = await createHelpChat(
        btnInteraction.user.id,
        newQuestion,
        sourceConversationId,
      );

      if (!newResult.aiResponse) {
        await newModalSubmit
          .followUp({
            embeds: [new ErrorEmbed("failed to get an ai answer, please try again")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      const newPagesData = await getAiChatConversationMessages(newResult.conversationId);

      const newPages = PageManager.createPages<HelpChatPage>(
        newPagesData.map((i) => ({ userQuery: i.userQuery, aiResponse: i.aiResponse as string })),
        1,
      );

      const newLastPage = newPages.size;
      const newInitialPage = newPages.get(newLastPage)?.[0];

      if (!newInitialPage) {
        await newModalSubmit
          .followUp({
            embeds: [new ErrorEmbed("failed to build help chat pages, please try again")],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      const newIcon = btnInteraction.client.user.avatarURL() || undefined;
      const newRows = createHelpPageRows(newLastPage <= 1);
      const newEmbed = buildHelpPageEmbed(
        btnInteraction.user.id,
        newResult.conversationId,
        newInitialPage,
        newIcon,
        newLastPage,
        newLastPage,
      );

      await manager.message.edit({
        embeds: [newEmbed],
        components: newRows,
      });

      const newManager = new PageManager<HelpChatPage>({
        message: manager.message,
        pages: newPages,
        row: newRows,
        userId: btnInteraction.user.id,
        embed: newEmbed,
        updateEmbed: (page, currentEmbed) => {
          const current = page?.[0];
          if (!current) return currentEmbed;

          return buildHelpPageEmbed(
            btnInteraction.user.id,
            newResult.conversationId,
            current,
            newIcon,
            1,
            1,
          );
        },
        onPageUpdate: (pageManager) => {
          const current = pageManager.pages.get(pageManager.currentPage)?.[0];

          if (!current) {
            return pageManager.embed;
          }

          return buildHelpPageEmbed(
            btnInteraction.user.id,
            newResult.conversationId,
            current,
            newIcon,
            pageManager.currentPage,
            pageManager.lastPage,
          );
        },
        handleResponses: new Map([["help-ai-continue", handleContinueQuestion]]),
      });

      newManager.currentPage = newManager.lastPage;
      void newManager.listen();
    };

    const manager = new PageManager<HelpChatPage>({
      message,
      pages,
      row: rows,
      userId: modalSubmit.user.id,
      embed,
      updateEmbed: (page, currentEmbed) => {
        const current = page?.[0];
        if (!current) return currentEmbed;

        return buildHelpPageEmbed(modalSubmit.user.id, result.conversationId, current, icon, 1, 1);
      },
      onPageUpdate: (pageManager) => {
        const current = pageManager.pages.get(pageManager.currentPage)?.[0];

        if (!current) {
          return pageManager.embed;
        }

        return buildHelpPageEmbed(
          modalSubmit.user.id,
          result.conversationId,
          current,
          icon,
          pageManager.currentPage,
          pageManager.lastPage,
        );
      },
      handleResponses: new Map([["help-ai-continue", handleContinueQuestion]]),
    });

    manager.currentPage = manager.lastPage;
    void manager.listen();
  },
} as InteractionHandler;
