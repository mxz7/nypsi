import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiClient } from "../../../../models/Client";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import {
  addMember,
  getPremiumProfile,
  getTier,
  setExpireDate,
  setTier,
} from "../../premium/premium";
import { getInventory, setInventoryItem } from "../inventory";
import dayjs = require("dayjs");

const SILVER_TIER = 2;

module.exports = new ItemUse(
  "silver_credit",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (message.deferred) {
          res = await message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data).catch(async () => {
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

    const currentTier = await getTier(message.author.id);

    if (currentTier > SILVER_TIER)
      return send({ embeds: [new ErrorEmbed("your current premium tier is higher than silver")] });

    if (currentTier == SILVER_TIER) {
      const [profile, inventory] = await Promise.all([
        getPremiumProfile(message.author.id),
        getInventory(message.member),
      ]);

      profile.expireDate = dayjs(profile.expireDate).add(7, "day").toDate();

      await setExpireDate(message.author.id, profile.expireDate, message.client as NypsiClient);

      await setInventoryItem(
        message.member,
        "silver_credit",
        inventory.find((i) => i.item === "silver_credit").amount - 1,
      );

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `your silver membership will now expire <t:${Math.floor(
              profile.expireDate.getTime() / 1000,
            )}:R>`,
          ),
        ],
      });
    } else if (currentTier === 0) {
      await addMember(message.author.id, SILVER_TIER, message.client as NypsiClient);
      await setExpireDate(
        message.author.id,
        dayjs().add(7, "day").toDate(),
        message.client as NypsiClient,
      );
      const inventory = await getInventory(message.member);
      await setInventoryItem(
        message.member,
        "silver_credit",
        inventory.find((i) => i.item === "silver_credit").amount - 1,
      );

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `your **silver** membership will expire <t:${dayjs().add(7, "day").unix()}:R>`,
          ),
        ],
      });
    } else {
      const msg = await send({
        embeds: [
          new CustomEmbed(
            message.member,
            "doing this will overwrite your current tier and you will not get the remaining time back. do you still want to continue?",
          ),
        ],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("con")
              .setLabel("continue")
              .setStyle(ButtonStyle.Danger),
          ),
        ],
      });

      const filter = (i: Interaction) => i.user.id === message.author.id;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {});

      if (!res) return msg.edit({ components: [] });

      await res.deferUpdate();
      const inventory = await getInventory(message.member);

      if (
        !inventory.find((i) => i.item === "silver_credit") ||
        inventory.find((i) => i.item === "silver_credit").amount < 1
      ) {
        return send({ embeds: [new ErrorEmbed("lol!")] });
      }

      await setInventoryItem(
        message.member,
        "silver_credit",
        inventory.find((i) => i.item === "silver_credit").amount - 1,
      );

      await setTier(message.author.id, SILVER_TIER, message.client as NypsiClient);
      await setExpireDate(
        message.author.id,
        dayjs().add(7, "day").toDate(),
        message.client as NypsiClient,
      );

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `your **silver** membership will expire <t:${dayjs().add(7, "day").unix()}:R>`,
          ),
        ],
      });
    }
  },
);
