import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  GuildTextBasedChannel,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { startLootRain } from "../../../../scheduled/clusterjobs/random-drops";
import Constants from "../../../Constants";
import { getInventory, removeInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "rain",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
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

    let length = 1;

    if (Constants.LOOT_RAIN_ALLOWED_CHANNELS.includes(message.channelId)) length = 2;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("start-rain")
        .setLabel("start loot rain")
        .setStyle(ButtonStyle.Success),
    );

    const msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `💦 confirm to start a loot rain for **${length} minutes**` +
            (message.guildId !== Constants.NYPSI_SERVER_ID
              ? "\n\nyou can **double** the length of your loot rain by using it in the **[official nypsi server](https://nypsi.xyz/discord)**"
              : ""),
        ).setHeader(`${message.author.username}'s loot rain`, message.author.avatarURL()),
      ],
      components: [row],
    });

    const res = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 60000,
        componentType: ComponentType.Button,
      })
      .catch(() => {});

    if (!res) {
      row.components.forEach((c) => c.setDisabled(true));
      msg.edit({ components: [row] });
      return;
    }

    if (res.customId === "start-rain") {
      if (await redis.exists(`nypsi:lootrain:channel:${message.channelId}`))
        return res.reply({
          embeds: [
            new ErrorEmbed(
              "there is already a rain happening in this channel doofus. do you want to destroy nypsi!?",
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });

      const inventory = await getInventory(message.member);

      if (
        !inventory.find((i) => i.item === "rain") ||
        inventory.find((i) => i.item === "rain").amount < 1
      ) {
        return res.reply({
          embeds: [
            new ErrorEmbed("what happened to your rain buddy. YEAH. I SAW THAT").setImage(
              "https://cdn.nypsi.xyz/static/i_saw_that.jpeg",
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      await removeInventoryItem(message.member, "rain", 1);

      row.components.forEach((c) => c.setDisabled(true));

      await res.update({ components: [row] });
      res.followUp({
        embeds: [new CustomEmbed(message.member, "✅ your loot rain will start soon")],
        flags: MessageFlags.Ephemeral,
      });
      startLootRain(message.channel as GuildTextBasedChannel, message.author);
    }
  },
);
