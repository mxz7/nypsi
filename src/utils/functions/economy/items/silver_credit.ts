import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import {
  addMember,
  getCredits,
  getPremiumProfile,
  getTier,
  setCredits,
  setExpireDate,
  setTier,
} from "../../premium/premium";
import { getInventory, removeInventoryItem } from "../inventory";
import { addStat } from "../stats";
import dayjs = require("dayjs");

const SILVER_TIER = 2;

module.exports = new ItemUse(
  "silver_credit",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
    const currentTier = await getTier(message.author.id);

    if (currentTier > SILVER_TIER)
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("your current premium tier is higher than silver")],
      });

    if (currentTier == SILVER_TIER) {
      const profile = await getPremiumProfile(message.author.id);

      const credits = await getCredits(message.author.id);
      await setCredits(message.author.id, credits + 7);

      await removeInventoryItem(message.member, "silver_credit", 1);
      await addStat(message.member, "silver_credit");

      return ItemUse.send(message, {
        embeds: [
          new CustomEmbed(
            message.member,
            `your **silver** membership will expire <t:${(profile.expireDate.getTime() < Date.now()
              ? dayjs()
              : dayjs(profile.expireDate)
            )
              .add(await getCredits(message.author.id), "day")
              .unix()}:R>`,
          ),
        ],
      });
    } else if (currentTier === 0) {
      await addMember(message.author.id, SILVER_TIER, new Date());
      await setCredits(message.author.id, 7);
      await removeInventoryItem(message.member, "silver_credit", 1);
      await addStat(message.member, "silver_credit");

      return ItemUse.send(message, {
        embeds: [
          new CustomEmbed(
            message.member,
            `your **silver** membership will expire <t:${dayjs().add(7, "day").unix()}:R>`,
          ),
        ],
      });
    } else {
      const msg = await ItemUse.send(message, {
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

      if (!inventory.has("silver_credit")) {
        return res.editReply({ embeds: [new ErrorEmbed("lol!")] });
      }

      await removeInventoryItem(message.member, "silver_credit", 1);
      await addStat(message.member, "silver_credit");

      await setTier(message.author.id, SILVER_TIER);
      await setExpireDate(message.author.id, new Date());
      await setCredits(message.author.id, 7);

      return res.editReply({
        embeds: [
          new CustomEmbed(
            message.member,
            `your **silver** membership will expire <t:${dayjs().add(7, "day").unix()}:R>`,
          ),
        ],
        components: [],
      });
    }
  },
);
