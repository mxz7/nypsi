import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
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

const cmd = new Command("8ball", "ask the 8ball a question", "fun");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed("you must ask the 8ball something")] });
  }

  await addCooldown(cmd.name, message.member, 5);

  const question = args.join(" ");

  const response = answers[Math.floor(Math.random() * answers.length)];

  const embed = new CustomEmbed(
    message.member,
    `**${question}** - ${message.author.toString()}\n\n🎱 ${response}`,
  );

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
