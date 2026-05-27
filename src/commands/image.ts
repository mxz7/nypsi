import { CommandInteraction, MessageFlags } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import {
  addEventProgress,
  EventData,
  formatEventProgress,
  getCurrentEvent,
} from "../utils/functions/economy/events";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getRandomImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

type AnimalData = {
  aliases?: string[];
  task?: string;
};

const animals: Record<string, AnimalData> = {
  cat: {
    aliases: [
      "kitty",
      "meow",
      "chipichipichapachapaloobieloobielabalabamagicomiloobieloobieboomboomboomboom",
    ],
    task: "cats_daily",
  },
  dog: { task: "dogs_daily" },
  rabbit: { aliases: ["bunny", "wabbit", "bunbuns"] },
  capybara: { aliases: ["capy"] },
  hamster: {},
};

const cmd = new Command("image", "get a random picture of an animal", "animals");

cmd.setShorthands(
  Object.fromEntries([
    ...Object.keys(animals).map((name) => [name, `image ${name}`]),
    ...Object.entries(animals).flatMap(([name, data]) =>
      (data.aliases ?? []).map((alias) => [alias, `image ${name}`]),
    ),
  ]),
);

cmd.slashEnabled = true;

for (const [animal] of Object.entries(animals)) {
  cmd.slashData.addSubcommand((sub) =>
    sub.setName(animal).setDescription(`get a random picture of a ${animal}`),
  );
}

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const animal = args[0]?.toLowerCase();

  if (!animal || !animals[animal]) {
    return send({
      embeds: [new ErrorEmbed(`choose an animal: ${Object.keys(animals).join(", ")}`)],
    });
  }

  await addCooldown(cmd.name, message.member, 3);

  const image = await getRandomImage(animal).catch((): null => null);

  if (!image) return send({ embeds: [new ErrorEmbed(`failed to find a ${animal} image`)] });

  const eventProgress = await addEventProgress(
    message.client as NypsiClient,
    message.member,
    "animals",
    1,
  );

  let eventData: EventData;

  if (eventProgress) {
    eventData = await getCurrentEvent();
  }

  const embed = new CustomEmbed(
    message.member,
    eventProgress ? formatEventProgress(eventData, eventProgress, message.author.id) : undefined,
  )
    .disableFooter()
    .setImage(image.url);

  if (image.name) {
    embed.setTitle(image.name);
    embed.setURL(`https://animals.maxz.dev/${animal}/${image.id}`);
  }

  if (Math.floor(Math.random() * 25) === 7)
    embed.setFooter({ text: `upload your pets: animals.maxz.dev` });

  send({ embeds: [embed] });

  addProgress(message.member, "cute", 1);

  const { task } = animals[animal];
  if (task) addTaskProgress(message.member, task);
}

cmd.setRun(run);

module.exports = cmd;
