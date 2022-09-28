import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { createSurvey, getSurveys } from "../utils/functions/surveys";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("survey", "create a survey for users to respond to", Categories.INFO);

cmd.slashEnabled = true;
cmd.slashData.addSubcommand((create) =>
  create
    .setName("create")
    .setDescription("create a survey")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("the text/question asked to members")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(500)
    )
    .addIntegerOption((option) =>
      option.setName("hours").setDescription("amount of hours until survey ends").setMinValue(1).setMaxValue(72)
    )
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (message instanceof Message) {
    return send({ embeds: [new CustomEmbed(message.member, "use /survey")] });
  }

  if (!message.isChatInputCommand()) return;

  const surveys = await getSurveys(message.member);

  let max = 1;

  if (await isPremium(message.member)) {
    max += await getTier(message.member);
  }

  if (surveys.length >= max) {
    return send({
      embeds: [
        new ErrorEmbed(
          `you have reached your maximum amount of active surveys (\`${max}\`). you can become a patreon to create more`
        ),
      ],
    });
  }

  let desc = message.options.getString("text");
  const endsAt = dayjs()
    .add(message.options.getInteger("hours") || 12, "hours")
    .toDate();

  desc += `\n\n\`0\` answers\nends <t:${Math.floor(endsAt.getTime() / 1000)}:R>`;

  const embed = new CustomEmbed(message.member, desc).setHeader(
    `${message.author.username}'s survey`,
    message.author.avatarURL()
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("a").setLabel("answer").setStyle(ButtonStyle.Success)
  );

  const msg = await send({ embeds: [embed], components: [row] });

  return await createSurvey(message.author.id, message.options.getString("text"), endsAt, msg.id, message.channel.id);
}

cmd.setRun(run);

module.exports = cmd;
