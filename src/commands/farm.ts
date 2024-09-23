import {
  ActionRowBuilder,
  BaseMessageOptions,
  CommandInteraction,
  ComponentType,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getClaimable, getFarm } from "../utils/functions/economy/farm";
import { createUser, getItems, getPlantsData, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import _ = require("lodash");
import dayjs = require("dayjs");

const cmd = new Command("farm", "view your farms and harvest", "money").setAliases(["fields"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view your farms"))
  .addSubcommand((claim) =>
    claim.setName("harvest").setDescription("harvest everything from your farm"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  const farms = await getFarm(message.member);

  if (farms.length === 0) return send({ embeds: [new ErrorEmbed("you don't have any farms")] });

  if (args.length === 0) {
    const options = new StringSelectMenuBuilder().setCustomId("farm");

    for (const farm of farms) {
      if (options.options.find((i) => i.data.value === farm.plantId)) continue;

      options.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(getPlantsData()[farm.plantId].name)
          .setValue(farm.plantId)
          .setEmoji(getItems()[getPlantsData()[farm.plantId].item].emoji),
      );
    }

    const render = async (plantId: string) => {
      const embed = new CustomEmbed(message.member).setHeader(
        `${message.author.username}'s farm`,
        message.author.avatarURL(),
      );

      options.options.forEach((e) => e.setDefault(false));
      options.options.find((i) => i.data.value === plantId).setDefault(true);

      let growing = 0;
      let healthy = 0;

      let nextGrow = Number.MAX_SAFE_INTEGER;
      const plants = farms.filter((i) => {
        if (i.plantId === plantId) {
          const growTime =
            i.plantedAt.getTime() + getPlantsData()[plantId].growthTime * 1000 - Date.now();

          if (growTime > 0) {
            growing++;
            if (growTime < nextGrow) nextGrow = growTime;
          } else {
            healthy++;
          }

          return true;
        }
      });

      const ready = await getClaimable(message.member, plantId, false);

      embed.setDescription(
        `${getItems()[getPlantsData()[plantId].item].emoji} **${getPlantsData()[plantId].name}** farm\n\n` +
          `you have **${plants.length.toLocaleString()}** ${getPlantsData()[plantId].type}${plants.length > 1 ? "s" : ""}\n` +
          `${
            growing > 0
              ? `${growing.toLocaleString()} growing (next <t:${dayjs().add(nextGrow, "milliseconds").unix()}:R>)\n`
              : ""
          }` +
          `${healthy > 0 ? `${healthy.toLocaleString()} healthy\n` : ""}` +
          `${ready > 0 ? `\n\`${ready.toLocaleString()}x\` ${getItems()[getPlantsData()[plantId].item].emoji} ${getItems()[getPlantsData()[plantId].item].name} ready for harvest` : ""}`,
      );

      return embed;
    };

    const msg = await send({
      embeds: [await render(options.options[0].data.value)],
      components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options)],
    });

    const listen = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          componentType: ComponentType.StringSelect,
          time: 60000,
        })
        .catch(() => {
          options.setDisabled(true);
          msg.edit({
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options),
            ],
          });
        });

      if (!interaction) return;

      if (interaction.customId === "farm") {
        const embed = await render(interaction.values[0]);

        interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(options),
          ],
        });
        return listen();
      }
    };
    listen();
  } else if (["claim", "harvest"].includes(args[0].toLowerCase())) {
    const promises = [];

    const plantTypes: string[] = [];

    farms.forEach((plant) =>
      plantTypes.includes(plant.plantId) ? null : plantTypes.push(plant.plantId),
    );

    const earned = new Map<string, number>();

    for (const plant of plantTypes) {
      promises.push(
        (async () => {
          const items = await getClaimable(message.member, plant, true);
          if (items > 0) earned.set(plant, items);
        })(),
      );
    }

    await Promise.all(promises);

    if (earned.size === 0) return send({ embeds: [new ErrorEmbed("you have nothing to harvest")] });

    let desc = "you have harvested:\n\n";

    for (const [plantId, value] of earned.entries()) {
      desc += `\`${value.toLocaleString()}x\` ${getItems()[getPlantsData()[plantId].item].emoji} ${getItems()[getPlantsData()[plantId].item].name}`;
    }

    const embed = new CustomEmbed(message.member, desc).setHeader(
      `${message.author.username}'s farm`,
      message.author.avatarURL(),
    );

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
