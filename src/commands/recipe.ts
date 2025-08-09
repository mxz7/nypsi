import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { selectItem } from "../utils/functions/economy/inventory";
import { runItemInfo } from "../utils/functions/economy/item_info";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("recipe", "view the recipe for a craftable item", "money").setAliases([
  "howcraftthing",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed("/recipe <item>")] });
  }

  const selected = selectItem(args.join(" ").toLowerCase());

  if (!selected) {
    return send({ embeds: [new ErrorEmbed(`couldnt find \`${args.join(" ")}\``)] });
  }

  if (await runItemInfo(message, args, selected, "crafting", send)) {
    await addCooldown(cmd.name, message.member, 4);
  } else {
    return send({
      embeds: [new ErrorEmbed(`that item is not craftable nor is it used to craft anything`)],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
