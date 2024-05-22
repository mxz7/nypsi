import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const answers = [
  "as i see it, yes",
  "ask again later",
  "better not tell you now",
  "cannot predict now",
  "concentrate and ask again",
  "don't count on it",
  "it is certain",
  "it is decidedly so",
  "most likely",
  "my reply is no",
  "my sources say no",
  "outlook not so good",
  "outlook good",
  "reply hazy, try again",
  "signs point to yes",
  "very doubtful",
  "without a doubt",
  "yes.",
  "yes - definitely",
  "you may rely on it",
];

const uri = "https://eightballapi.com/api"

const cmd = new Command("8ball", "ask the 8ball a question", "fun").setAliases(["8"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("you must ask the 8ball something")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const question = args.join(" ");

  // can also add lucky and biased params for extra fun, might be interesing
  const url = `${uri}?question=${question}&lucky=true&biased=false`;
  let response = await fetch(url).then((res) => res.json()).then((json) => json.reading);

  // fallback if api fails so user still gets answers
  if (!response) {
    response = answers[Math.floor(Math.random() * answers.length)];
  }

  const embed = new CustomEmbed(
    message.member,
    `**${question}** - ${message.author.toString()}\n\n🎱 ${response}`,
  );

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
