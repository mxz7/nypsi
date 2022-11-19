import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { calcMaxBet, getBankBalance, getMulti, updateBankBalance } from "../utils/functions/economy/balance.js";
import { addBooster, getBoosters } from "../utils/functions/economy/boosters.js";
import { addInventoryItem } from "../utils/functions/economy/inventory.js";
import {
  getPrestige,
  getPrestigeRequirement,
  getPrestigeRequirementBal,
  setPrestige,
} from "../utils/functions/economy/prestige.js";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import { getXp, updateXp } from "../utils/functions/economy/xp.js";
import { addCooldown, addExpiry, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("prestige", "prestige to gain extra benefits", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const edit = async (data: MessageEditOptions, msg: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (!(await userExists(message.member))) await createUser(message.member);

  // if (await getPrestige(message.member) >= 20) {
  //     return send({
  //         embeds: [
  //             new ErrorEmbed("gg, you're max prestige. you completed nypsi").setImage("https://i.imgur.com/vB3UGgi.png"),
  //         ],
  //     })
  // }

  let currentXp = await getXp(message.member),
    neededXp = await getPrestigeRequirement(message.member);
  let currentBal = await getBankBalance(message.member),
    neededBal = getPrestigeRequirementBal(neededXp);

  if (currentXp < neededXp) {
    const remainingXp = neededXp - currentXp;

  return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you have $**${currentXp.toLocaleString()}/${neededXp.toLocaleString()}**xp to prestige`
        ).setHeader("prestige", message.author.avatarURL()).setFooter(`you need ${remainingXp.toLocaleString()} more xp`),
      ],
    });
  }

  if (currentBal < neededBal) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
        ).setHeader("prestige", message.author.avatarURL()),
      ],
    });
  }

  const embed = new CustomEmbed(
    message.member,
    "are you sure you want to prestige?\n\n" +
      `you will lose **${neededXp.toLocaleString()}**xp and $**${neededBal.toLocaleString()}**\n\n`
  ).setHeader("prestige", message.author.avatarURL());

  await addCooldown(cmd.name, message.member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success)
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      embed.setDescription("❌ expired");
      await edit({ embeds: [embed], components: [] }, msg);
      addExpiry(cmd.name, message.member, 30);
    });

  if (reaction == "✅") {
    await addExpiry(cmd.name, message.member, 1800);
    currentXp = await getXp(message.member);
    neededXp = await getPrestigeRequirement(message.member);
    currentBal = await getBankBalance(message.member);
    neededBal = getPrestigeRequirementBal(neededXp);

    if (currentXp < neededXp) {
      return send({
        embeds: [new ErrorEmbed(`you need **${neededXp.toLocaleString()}**xp to prestige`)],
      });
    }

    if (currentBal < neededBal) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `you need $**${neededBal.toLocaleString()}** in your **bank** to be able to prestige`
          ).setHeader("prestige", message.author.avatarURL()),
        ],
      });
    }

    await updateBankBalance(message.member, currentBal - neededBal);
    await updateXp(message.member, currentXp - neededXp);
    await setPrestige(message.member, (await getPrestige(message.member)) + 1);

    const multi = await getMulti(message.member);
    const maxBet = await calcMaxBet(message.member);

    let amount = 1;

    if ((await getPrestige(message.member)) > 5) {
      amount = 2;
    } else if ((await getPrestige(message.member)) > 10) {
      amount = 3;
    }

    amount += Math.floor((await getPrestige(message.member)) / 5);

    await addInventoryItem(message.member, "basic_crate", amount);

    const boosters = await getBoosters(message.member);

    let booster = false;

    if (boosters.has("xp_potion")) {
      if (boosters.get("xp_potion").length < 3) {
        booster = true;
        await addBooster(message.member, "xp_potion");
      }
    } else {
      booster = true;
      await addBooster(message.member, "xp_potion");
    }

    let crateAmount = Math.floor((await getPrestige(message.member)) / 2 + 1);

    if (crateAmount > 6) crateAmount = 6;

    let prestige = await getPrestige(message.author.id);

    if (prestige > 15) prestige = 15;

    embed.setDescription(
      `you are now prestige **${await getPrestige(message.member)}**\n\n` +
        `new vote rewards: $**${Math.floor(
          15000 * (prestige / 2 + 1)
        ).toLocaleString()}**, **${crateAmount}** vote crates\n` +
        `your new multiplier: **${Math.floor(multi * 100)}**%\nyour maximum bet: $**${maxBet.toLocaleString()}**\n` +
        `you have received **${amount}** basic crate${amount > 1 ? "s" : ""}${
          booster ? " and an xp booster for 30 minutes" : ""
        }`
    );

    await edit({ embeds: [embed], components: [] }, msg);
  }
}

cmd.setRun(run);

module.exports = cmd;
