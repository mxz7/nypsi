import { Collection, CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("delp", "bulk delete/purge your own messages", "moderation").setAliases([
  "dp",
  "d",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  let amount = 25;

  if (await isPremium(message.author.id)) {
    if ((await getTier(message.author.id)) == 4) {
      amount = 100;
    } else {
      amount = 50;
    }
  }

  await addCooldown(cmd.name, message.member, 20);

  let collected: Collection<string, Message> = await message.channel.messages.fetch({
    limit: amount == 25 ? 25 : 100,
  });

  collected = collected.filter((msg) => {
    if (!msg.author) return;
    return msg.author.id == message.author.id;
  });

  if (collected.size == 0) {
    return;
  }

  if (collected.size > amount) {
    const collectedValues = Array.from(collected.values());

    collectedValues.splice(amount + 1, collectedValues.length);

    collected = new Collection();

    for (const msg of collectedValues) {
      collected.set(msg.id, msg);
    }
  }

  if (!message.channel.isTextBased()) return;

  if (message.channel.isDMBased()) return;

  await message.channel.bulkDelete(collected).catch(() => {});
}

cmd.setRun(run);

module.exports = cmd;
