import { CommandInteraction, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { addInventoryItem } from "../utils/functions/economy/inventory";
import { getItems, userExists } from "../utils/functions/economy/utils";
import { addCooldown, inCooldown } from "../utils/functions/guilds/utils";
import { logger } from "../utils/logger";

const cmd = new Command("crateall", "give every user in the current guild a crate", Categories.NONE).setPermissions([
  "bot owner",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.member.user.id != Constants.TEKOH_ID) return;

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("u know how this works")] });
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
    return message.channel.send({ embeds: [new ErrorEmbed(`couldnt find \`${args[0]}\``)] });
  }

  if (selected.role != "crate") {
    return message.channel.send({ embeds: [new ErrorEmbed(`${selected.name} is not a crate`)] });
  }

  let members;

  if (
    inCooldown(message.guild) ||
    message.guild.memberCount == message.guild.members.cache.size ||
    message.guild.memberCount <= 50
  ) {
    members = message.guild.members.cache;
  } else {
    members = await message.guild.members.fetch();
    addCooldown(message.guild, 3600);
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

        await addInventoryItem(member, selected.id, amount, false);

        logger.info(`${amount} ${selected.id} given to ${member.user.tag} (${member.user.id})`);
        count += amount;
      })()
    );
  }

  await Promise.all(promises);

  return message.channel.send({
    embeds: [new CustomEmbed(message.member, `**${count}** ${selected.name}${count != 1 ? "s" : ""} given`)],
  });
}

cmd.setRun(run);

module.exports = cmd;
