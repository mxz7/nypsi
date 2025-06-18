import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { isMarried, removeMarriage } from "../utils/functions/users/marriage";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getLastKnownUsername } from "../utils/functions/users/tag";
import { addNotificationToQueue } from "../utils/functions/users/notifications";

const cmd = new Command("divorce", "divorce your partner", "fun");

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

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
    new ButtonBuilder().setCustomId("yes").setLabel("confirm").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("no").setLabel("cancel").setStyle(ButtonStyle.Primary),
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
                .setCustomId("boobies")
                .setDisabled(true),
            ),
          ],
        },
        msg,
      ).catch(() => {});
    });

  if (!reaction) return edit({ embeds: [embed], components: [] }, msg);

  const { res, interaction } = reaction;

  if (res == "yes") {
    interaction.deferUpdate();
    await removeMarriage(message.member);
    await addInventoryItem(married.partnerId, "broken_ring", 1);

    embed.setDescription(`✅ you have divorced ${partnerName}`);

    addNotificationToQueue({
      memberId: married.partnerId,
      payload: {
        embed: new CustomEmbed(
          married.partnerId,
          `${getItems()["broken_ring"].emoji} you have been divorced by ${message.member.user.username}!`,
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
