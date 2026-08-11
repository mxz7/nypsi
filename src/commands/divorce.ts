import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addInventoryItem, addItemSourceStat } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { escapeFormattingCharacters } from "../utils/functions/string";
import { isMarried, removeMarriage } from "../utils/functions/users/marriage";
import { addNotificationToQueue } from "../utils/functions/users/notifications";
import { getLastKnownUsername } from "../utils/functions/users/username";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("divorce", "divorce your partner", "fun");

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data as InteractionEditReplyOptions).catch(() => {});
      return await message.fetchReply();
    } else {
      return await msg.edit(data).catch(() => {});
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  const married = await isMarried(message.member);

  if (!married)
    return send({ embeds: [new ErrorEmbed("you are not married")], flags: MessageFlags.Ephemeral });

  await addCooldown(cmd.name, message.member, 30);

  const partnerName = await getLastKnownUsername(married.partnerId);

  const embed = new CustomEmbed(message.member)
    .setHeader("confirm divorce")
    .setDescription(`are you sure you want to divorce ${partnerName}?`);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("btn-confirm").setLabel("confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("btn-cancel").setLabel("cancel").setStyle(ButtonStyle.Primary),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.member.id;

  if (!msg) return;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 30000 })
    .then(async (collected) => {
      return { res: collected.customId, interaction: collected };
    })
    .catch(async () => {
      await edit(
        {
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Danger)
                .setLabel("expired")
                .setCustomId("btn-disabled")
                .setDisabled(true),
            ),
          ],
        },
        msg,
      ).catch(() => {});
    });

  if (!reaction) return edit({ embeds: [embed], components: [] }, msg);

  const { res, interaction } = reaction;

  if (res == "btn-confirm") {
    await interaction.deferUpdate();

    if (!(await isMarried(message.member))) {
      embed.setDescription("❌ you are no longer married");
      return edit({ embeds: [embed], components: [] }, msg);
    }

    const divorce = await removeMarriage(message.member);

    if (!divorce) {
      embed.setDescription("❌ you are no longer married");
      return edit({ embeds: [embed], components: [] }, msg);
    }

    const divorcePartnerName = await getLastKnownUsername(divorce.partnerId);

    await addInventoryItem(divorce.partnerId, "broken_ring", 1);
    addItemSourceStat("broken_ring", "divorce", 1);

    embed.setDescription(`✅ you have divorced ${divorcePartnerName}`);

    addNotificationToQueue({
      memberId: divorce.partnerId,
      payload: {
        embed: new CustomEmbed(
          divorce.partnerId,
          `${getItems()["broken_ring"].emoji} you have been divorced by ${escapeFormattingCharacters(message.member.user.username)}!`,
        ).setFooter({ text: `+1 broken ring` }),
      },
    });

    return edit({ embeds: [embed], components: [] }, msg);
  } else {
    interaction.reply({
      embeds: [new CustomEmbed(message.member, "✅ cancelled")],
      flags: MessageFlags.Ephemeral,
    });
    return edit({ embeds: [embed], components: [] }, msg);
  }
}

cmd.setRun(run);

module.exports = cmd;
