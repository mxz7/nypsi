import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getAutosellItems, setAutosellItems } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("autosell", "add items to your autosell list", "money").setAliases(["as"]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) =>
  option
    .setName("item")
    .setAutocomplete(true)
    .setDescription("item to add/remove to your autosell list"),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  await addCooldown(cmd.name, message.member, 3);

  let current = await getAutosellItems(message.member);
  let max = 7;

  if (await isPremium(message.member)) max *= await getTier(message.member);

  if (current.length > max)
    current = await setAutosellItems(message.member, current.splice(0, max));

  const items = getItems();

  if (args.length == 0) {
    if (current.length == 0) {
      return send({
        embeds: [new CustomEmbed(message.member, "there is nothing being automatically sold")],
      });
    }

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `automatically selling: \n\n${current
            .map((i) => `${items[i].emoji} ${items[i].name}`)
            .join("\n")}`,
        ).setHeader("autosell", message.author.avatarURL()),
      ],
    });
  }

  const searchTag = args[0].toLowerCase();

  if (searchTag == "clear") {
    if (current.length == 0)
      return send({ embeds: [new ErrorEmbed(`you dont have anything being automatically sold`)] });

    await setAutosellItems(message.member, []);
    return send({
      embeds: [
        new CustomEmbed(message.member, "✅ cleared autosell").setHeader(
          "autosell",
          message.author.avatarURL(),
        ),
      ],
    });
  }

  let selected;

  for (const itemName of Array.from(Object.keys(items))) {
    const aliases = items[itemName].aliases ? items[itemName].aliases : [];
    if (searchTag == itemName) {
      selected = itemName;
      break;
    } else if (searchTag == itemName.split("_").join("")) {
      selected = itemName;
      break;
    } else if (aliases.indexOf(searchTag) != -1) {
      selected = itemName;
      break;
    } else if (searchTag == items[itemName].name) {
      selected = itemName;
      break;
    }
  }

  selected = items[selected];

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  let desc = "";

  if (current.includes(selected.id)) {
    desc = `✅ removed ${selected.emoji} ${selected.name}`;

    current.splice(current.indexOf(selected.id), 1);

    current = await setAutosellItems(message.member, current);
  } else {
    if (current.length >= max) {
      let desc = `you have reached the limit of autosell items (**${max}**)`;

      if (max == 1) {
        desc += "\n\nyou can upgrade this with premium membership (`/premium`)";
      }

      return send({ embeds: [new ErrorEmbed(desc)] });
    }

    desc = `✅ added ${selected.emoji} ${selected.name}`;

    current.push(selected.id);

    current = await setAutosellItems(message.member, current);
  }

  const embed = new CustomEmbed(message.member, desc).setHeader(
    "autosell",
    message.author.avatarURL(),
  );

  if (current.length > 0) {
    embed.addField(
      "automatically selling",
      current.map((i) => `${items[i].emoji} ${items[i].name}`).join("\n"),
    );
  }

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
