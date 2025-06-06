import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { runBakery } from "../utils/functions/economy/bakery";
import { getInventory, removeInventoryItem } from "../utils/functions/economy/inventory";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "bake",
  "use your furnace to bake cookies and cakes! (doesnt remove your furnace because cookies are cool)",
  "money",
);

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  doBake(message);
}

async function doBake(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction) | ButtonInteraction,
) {
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

  const member = await message.guild.members.fetch(message.member.user.id);

  if (!member) return;

  if (await onCooldown(cmd.name, member)) {
    const res = await getResponse(cmd.name, member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!(await userExists(member))) await createUser(member);

  const inventory = await getInventory(member);

  if (!inventory.has("furnace")) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need a furnace to bake. furnaces can be found in crates or bought from the shop",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!inventory.has("coal")) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need coal to bake. coal can be found when mining or bought from the shop",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  await addCooldown(cmd.name, member, 60);
  await removeInventoryItem(member, "coal", 1);

  const response = await runBakery(member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bake").setLabel("bake").setStyle(ButtonStyle.Success),
  );

  return send({ embeds: [response], components: [row] });
}

cmd.setRun(run);

module.exports = cmd;
