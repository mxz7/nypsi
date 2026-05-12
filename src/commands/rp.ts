import { CommandInteraction, MessageFlags } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getMember } from "../utils/functions/member";
import { addRoleplayStat } from "../utils/functions/roleplay";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

type RoleplayAction = {
  gifs: string[];
  senderText: string; // e.g. "**{sender}** kissed **{target}**"
  selfText: string; // used when no target given
};

const actions: Record<string, RoleplayAction> = {
  kiss: {
    gifs: [
      "https://c.tenor.com/N57Xg6F8-vYAAAAd/tenor.gif",
      "https://c.tenor.com/W-R9sPkk_IMAAAAd/tenor.gif",
    ],
    senderText: "**{sender}** kissed **{target}** 💋",
    selfText: "**{sender}** kissed themselves... that's a bit lonely 💋",
  },
  hug: {
    gifs: [
      "https://c.tenor.com/ac3otYT77RcAAAAd/tenor.gif",
      "https://c.tenor.com/2s-NG_10o4MAAAAd/tenor.gif",
    ],
    senderText: "**{sender}** hugged **{target}** 🤗",
    selfText: "**{sender}** hugged themselves 🤗",
  },
};

const cmd = new Command("rp", "roleplay actions", "fun").setAliases(["roleplay"]);

// build shorthands from actions: kiss -> rp kiss, hug -> rp hug
cmd.setShorthands(
  Object.fromEntries(Object.keys(actions).map((action) => [action, `rp ${action}`])),
);

cmd.slashEnabled = true;

for (const [action] of Object.entries(actions)) {
  cmd.slashData.addSubcommand((sub) =>
    sub
      .setName(action)
      .setDescription(`${action} someone`)
      .addUserOption((opt) =>
        opt.setName("target").setDescription(`the person to ${action}`).setRequired(false),
      ),
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

  const action = args[0]?.toLowerCase();

  if (!action || !actions[action]) {
    const list = Object.keys(actions).join(", ");
    return send({
      embeds: [
        new CustomEmbed(message.member)
          .setHeader("roleplay")
          .setDescription(`available actions: ${list}\n\nusage: \`$rp <action> [user]\``),
      ],
    });
  }

  const actionData = actions[action];

  await addCooldown(cmd.name, message.member, 3);

  let target = message.mentions?.members?.first();

  if (!target && args[1]) {
    target = await getMember(message.guild, args.slice(1).join(" "));
    if (!target) {
      return send({ embeds: [new ErrorEmbed("couldn't find that user")] });
    }
  }

  if (!target) {
    return send({ embeds: [new ErrorEmbed(`you need to specify someone to ${action}`)] });
  }

  const senderName = message.author.username;
  const targetName = target.user.username;

  const text =
    target.user.id !== message.author.id
      ? actionData.senderText.replace("{sender}", senderName).replace("{target}", targetName)
      : actionData.selfText.replace("{sender}", senderName);

  const gif = actionData.gifs[Math.floor(Math.random() * actionData.gifs.length)];

  const count =
    target.user.id !== message.author.id
      ? await addRoleplayStat(message.author.id, target.user.id, action)
      : null;

  const embed = new CustomEmbed(message.member).setHeader(text, message.author.avatarURL()).setImage(gif);

  if (count !== null) {
    embed.setFooter({ text: `${count} time${count === 1 ? "" : "s"}` });
  }

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
