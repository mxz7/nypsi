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
import {
  addInventoryItem,
  getInventory,
  removeInventoryItem,
} from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addMarriage, isMarried } from "../utils/functions/users/marriage";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("marry", "marry your ekitten", "fun");

cmd.slashEnabled = true;

cmd.slashData.addUserOption((user) =>
  user.setName("user").setDescription("who do you want to marry").setRequired(true),
);

const requesting = new Set<string>();
const requested = new Set<string>();

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
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

  if (args.length != 1) {
    return send({ embeds: [new ErrorEmbed("/marry <user>")] });
  }

  if (await isMarried(message.member))
    return send({
      embeds: [
        new ErrorEmbed("you are already married").setFooter({
          text: "divorce your current partner with /divorce",
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });

  if (!(await getInventory(message.member)).has("ring")) {
    return send({
      embeds: [new ErrorEmbed("you must have a ring to propose to someone")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (requesting.has(message.member.id)) {
    return send({
      embeds: [new ErrorEmbed("you are already proposing to someone")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!message.mentions?.members?.first()) {
    return send({
      embeds: [new ErrorEmbed("you must tag the member you want to marry")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const target = message.mentions.members.first();

  if (target.user.id == message.member.id) {
    return send({
      embeds: [new ErrorEmbed("you cannot marry yourself")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (requested.has(target.user.id)) {
    return send({
      embeds: [new ErrorEmbed("this user is currently being proposed to. wait your turn!!")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!(await userExists(target))) {
    return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });
  }

  if (await isMarried(target)) {
    return send({
      embeds: [new ErrorEmbed("that user is already married")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await addCooldown(cmd.name, message.member, 30);

  requested.add(target.user.id);
  requesting.add(message.member.id);

  const embed = new CustomEmbed(message.member)
    .setHeader("marriage proposal")
    .setDescription(`do you take ${message.member.toString()} to be your lawfully wedded partner?`);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("yes")
      .setLabel("i do!")
      .setStyle(ButtonStyle.Success)
      .setEmoji(getItems()["ring"].emoji),
    new ButtonBuilder()
      .setCustomId("no")
      .setLabel("run away")
      .setStyle(ButtonStyle.Danger)
      .setEmoji(getItems()["broken_ring"].emoji),
  );

  const msg = await send({ content: target.toString(), embeds: [embed], components: [row] }).catch(
    () => {
      requested.delete(target.user.id);
      requesting.delete(message.member.id);
    },
  );

  const filter = (i: Interaction) => i.user.id == target.user.id;
  let fail = false;

  if (!msg) return;

  await removeInventoryItem(message.member, "ring", 1);

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 30000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
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
      fail = true;
      requested.delete(target.user.id);
      requesting.delete(message.member.id);
    });

  if (fail) {
    await addInventoryItem(message.member, "ring", 1);
    return;
  }

  if (reaction == "yes") {
    if (await isMarried(target)) {
      embed.setDescription("❌ you are already married");
    } else if (await isMarried(message.member)) {
      embed.setDescription(`❌ ${message.member.user.username} is already married`);
    } else {
      await addMarriage(message.member.id, target.id);
      embed.setDescription("you may now kiss the bride!");
    }
  } else {
    await addInventoryItem(message.member, "broken_ring", 1);
    embed.setDescription("oh. that was awkward.").setFooter({ text: `+1 broken ring` });
  }

  requested.delete(target.user.id);
  requesting.delete(message.member.id);

  return edit({ embeds: [embed], components: [] }, msg);
}

cmd.setRun(run);

module.exports = cmd;
