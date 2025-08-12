import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getItems, userExists } from "../utils/functions/economy/utils";
import { pluralize } from "../utils/functions/string";
import { logger } from "../utils/logger";

const cmd = new Command(
  "crateall",
  "give every user in the current guild a crate",
  "none",
).setPermissions(["bot owner"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (message.author.id != Constants.OWNER_ID) return;

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("u know how this works")] });
  }

  const items = getItems();

  const searchTag = args[0].toLowerCase();

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
    }
  }

  selected = items[selected];

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  if (!["crate", "scratch-card"].includes(selected.role)) {
    return send({ embeds: [new ErrorEmbed(`${selected.name} is not a crate`)] });
  }

  let members;

  if (message.guild.memberCount == message.guild.members.cache.size) {
    members = message.guild.members.cache;
  } else {
    members = await message.guild.members.fetch().catch((e) => {
      logger.error("failed to fetch members for crateall", e);
      return message.guild.members.cache;
    });
  }

  let amount = 1;

  if (args[1]) {
    amount = parseInt(args[1]);
  }

  let count = 0;
  const promises = [];

  for (const m of members.keys()) {
    promises.push(
      (async () => {
        const member = members.get(m);

        if (!(await userExists(m))) return;

        await addInventoryItem(member, selected.id, amount);

        logger.info(
          `${amount} ${selected.id} given to ${member.user.id} (${member.user.username})`,
        );
        count += amount;
      })(),
    );
  }

  await Promise.all(promises);

  return send({
    embeds: [new CustomEmbed(message.member, `**${count}** ${pluralize(selected, count)} given`)],
  });
}

cmd.setRun(run);

module.exports = cmd;
