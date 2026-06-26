import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  LabelBuilder,
  MessageActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  getApproximatePrizePool,
  getLotteryAutoBuySettings,
  setLotteryAutoBuySettings,
} from "../utils/functions/economy/lottery";
import {
  createUser,
  formatNumberPretty,
  getItems,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";

const cmd = new Command("lottery", "enter the daily lottery draw", "money").setAliases(["lotto"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((autobuy) =>
    autobuy.setName("autobuy").setDescription("manage lottery autobuy settings"),
  )
  .addSubcommand((tickets) =>
    tickets.setName("view").setDescription("view the current lottery status"),
  );

type LotteryAutoBuyMode = "daily" | "lottery";

function createAutoBuyEmbed(
  member: NypsiMessage["member"],
  amount: number | null,
  mode: LotteryAutoBuyMode | null,
) {
  const modeText = mode === "lottery" ? "every lottery" : mode === "daily" ? "daily" : "none";
  const amountText = typeof amount === "number" ? amount.toLocaleString() : "disabled";
  const costText =
    typeof amount === "number"
      ? `$${Math.ceil(getItems()["lottery_ticket"].buy * amount * 0.95).toLocaleString()}`
      : "n/a";

  return new CustomEmbed(member)
    .setHeader("lottery autobuy")
    .setDescription(
      `configure your lottery autobuy settings\n\n` +
        `mode: **${modeText}**\n` +
        `amount: **${amountText}**\n` +
        `cost per run: **${costText}** (5% discount)\n\n` +
        `use the buttons below to change mode, set amount, or disable autobuy`,
    );
}

function createAutoBuyRow(
  mode: LotteryAutoBuyMode | null,
  disabled = false,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("autobuy-mode-daily")
      .setLabel("daily")
      .setStyle(mode === "daily" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("autobuy-mode-lottery")
      .setLabel("every lottery")
      .setStyle(mode === "lottery" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("autobuy-set-amount")
      .setLabel("set amount")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("autobuy-disable")
      .setLabel("disable")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function getAmountFromModal(interaction: ButtonInteraction) {
  const id = `lottery-autobuy-amount-${Math.floor(Math.random() * 1_000_000)}`;
  const modal = new ModalBuilder().setCustomId(id).setTitle("set lottery autobuy amount");

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("amount of tickets")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("amount")
          .setPlaceholder("enter a number between 0 and 100000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(6),
      ),
  );

  await interaction.showModal(modal);

  const filter = (i: ModalSubmitInteraction) =>
    i.user.id === interaction.user.id && i.customId === id;

  return await interaction.awaitModalSubmit({ filter, time: 60_000 }).catch(() => {});
}

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const help = async () => {
    const tickets = (await getInventory(message.member)).count("lottery_ticket");
    const embed = new CustomEmbed(message.member);

    const pool = await getApproximatePrizePool();
    const autoBuy = await getLotteryAutoBuySettings(message.member);
    const autoBuyText =
      typeof autoBuy.amount === "number"
        ? `, auto buying ${autoBuy.amount} tickets ${
            autoBuy.time === "lottery" ? "every lottery" : "daily"
          }`
        : "";

    embed.setHeader("lottery", message.author.avatarURL());
    embed.setDescription(
      `nypsi lottery is a daily draw which happens in the [official nypsi server](${Constants.NYPSI_SERVER_INVITE_LINK})\nnext draw <t:${dayjs()
        .add(1, "day")
        .startOf("day")
        .unix()}:R>\n\n` +
        `current prize pool is $**${formatNumberPretty(pool.min)}** - $**${formatNumberPretty(pool.max)}**\n\n` +
        `you can buy lottery tickets with ${(await getPrefix(message.guild))[0]}**buy lotto**\nyou have **${tickets.toLocaleString()}** tickets${autoBuyText}`,
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "buy" || args[0].toLowerCase() == "b") {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `this has moved to ${(await getPrefix(message.guild))[0]}**buy lotto**`,
        ),
      ],
    });
  } else if (args[0].toLowerCase() == "view") {
    return help();
  } else if (args[0].toLowerCase() === "autobuy") {
    const settings = await getLotteryAutoBuySettings(message.member);

    let amount: number | null = settings.amount;
    let mode: LotteryAutoBuyMode | null = settings.time as LotteryAutoBuyMode | null;

    const msg = await send({
      embeds: [createAutoBuyEmbed(message.member, amount, mode)],
      components: [createAutoBuyRow(mode)],
    });

    const filter = (i: Interaction) => i.user.id === message.author.id;

    const listen = async (): Promise<void> => {
      const collected = await msg
        .awaitMessageComponent({ filter, time: 120_000 })
        .catch(async () => {
          await msg.edit({ components: [createAutoBuyRow(mode, true)] }).catch(() => {});
        });

      if (!collected || !collected.isButton()) return;

      if (collected.customId === "autobuy-mode-daily") {
        mode = "daily";
        await setLotteryAutoBuySettings(message.member, amount, mode);
        await collected.update({
          embeds: [createAutoBuyEmbed(message.member, amount, mode)],
          components: [createAutoBuyRow(mode)],
        });
      } else if (collected.customId === "autobuy-mode-lottery") {
        mode = "lottery";
        await setLotteryAutoBuySettings(message.member, amount, mode);
        await collected.update({
          embeds: [createAutoBuyEmbed(message.member, amount, mode)],
          components: [createAutoBuyRow(mode)],
        });
      } else if (collected.customId === "autobuy-set-amount") {
        const modalSubmit = await getAmountFromModal(collected);

        if (!modalSubmit) return;

        const input = modalSubmit.fields.getTextInputValue("amount").trim();
        const nextAmount = parseInt(input, 10);

        if (isNaN(nextAmount) || nextAmount < 0 || nextAmount > 100000) {
          await modalSubmit.reply({ embeds: [new ErrorEmbed("invalid number")], ephemeral: true });
          return listen();
        }

        amount = nextAmount;

        if (amount === 0) {
          amount = null;
        }

        if (!mode) {
          mode = "daily";
        }

        await setLotteryAutoBuySettings(message.member, amount, mode);

        await modalSubmit.deferUpdate();
        await msg.edit({
          embeds: [createAutoBuyEmbed(message.member, amount, mode)],
          components: [createAutoBuyRow(mode)],
        });
      } else if (collected.customId === "autobuy-disable") {
        amount = null;
        mode = null;
        await setLotteryAutoBuySettings(message.member, null, null);
        await collected.update({
          embeds: [createAutoBuyEmbed(message.member, amount, mode)],
          components: [createAutoBuyRow(mode)],
        });
      }

      return listen();
    };

    return listen();
  } else {
    return help();
  }
}

cmd.setRun(run);

module.exports = cmd;
