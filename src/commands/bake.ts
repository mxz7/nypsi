import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { runBakery } from "../utils/functions/economy/bakery";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "bake",
  "use your furnace to bake cookies and cakes! (doesnt remove your furnace because cookies are cool)",
  Categories.MONEY
);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  doBake(message);
}

async function doBake(message: Message | (NypsiCommandInteraction & CommandInteraction) | ButtonInteraction) {
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

  const member = await message.guild.members.fetch(message.member.user.id);

  if (!member) return;

  if (await onCooldown(cmd.name, member)) {
    const embed = await getResponse(cmd.name, member);

    return send({ embeds: [embed], ephemeral: true });
  }

  if (!(await userExists(member))) await createUser(member);

  const inventory = await getInventory(member, false);

  let hasFurnace = false;
  let hasCoal = false;

  if (inventory.find((i) => i.item == "furnace") && inventory.find((i) => i.item == "furnace").amount > 0) {
    hasFurnace = true;
  }

  if (inventory.find((i) => i.item == "coal") && inventory.find((i) => i.item == "coal").amount > 0) {
    hasCoal = true;
  }

  if (!hasFurnace) {
    return send({
      embeds: [new ErrorEmbed("you need a furnace to bake. furnaces can be found in crates or bought from the shop")],
      ephemeral: true,
    });
  }

  if (!hasCoal) {
    return send({
      embeds: [new ErrorEmbed("you need coal to bake. coal can be found when mining or bought from the shop")],
      ephemeral: true,
    });
  }

  await addCooldown(cmd.name, member, 15);
  await setInventoryItem(member, "coal", inventory.find((i) => i.item === "coal").amount - 1, false);

  const response = await runBakery(member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bake").setLabel("bake").setStyle(ButtonStyle.Success)
  );

  return send({ embeds: [response], components: [row] });
}

cmd.setRun(run);

module.exports = cmd;
