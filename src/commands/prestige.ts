import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  getLevel,
  getPrestige,
  getUpgrades,
  setLevel,
  setPrestige,
  setUpgrade,
} from "../utils/functions/economy/levelling.js";
import {
  createUser,
  getUpgradesData,
  maxPrestige,
  userExists,
} from "../utils/functions/economy/utils.js";
import { percentChance } from "../utils/functions/random";
import {
  addCooldown,
  addExpiry,
  getResponse,
  onCooldown,
} from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("prestige", "prestige to gain extra benefits", "money");

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
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

  if (!(await userExists(message.member))) await createUser(message.member);

  let [level, prestige] = await Promise.all([
    getLevel(message.member),
    getPrestige(message.member),
  ]);

  if (level < 100) {
    return send({
      embeds: [new ErrorEmbed(`you must be at least level 100 to prestige\n\n${level}/100`)],
    });
  }

  if (prestige >= maxPrestige)
    return send({
      embeds: [
        new CustomEmbed(message.member, "you're at max prestige. well done. nerd. <3").setImage(
          "https://file.maxz.dev/If87xT6LC_.png",
        ),
      ],
    });

  const embed = new CustomEmbed(
    message.member,
    `confirm you want to become even cooler (prestige ${prestige + 1} level ${level - 100})`,
  ).setHeader("prestige", message.author.avatarURL());

  await addCooldown(cmd.name, message.member);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const reaction = await msg
    .awaitMessageComponent({ filter, time: 15000 })
    .then(async (collected) => {
      await collected.deferUpdate();
      return collected.customId;
    })
    .catch(async () => {
      await msg.edit({
        embeds: [embed],
        components: [
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Danger)
              .setLabel("expired")
              .setCustomId("boobies")
              .setDisabled(true),
          ),
        ],
      });
      addExpiry(cmd.name, message.member, 30);
    });

  if (reaction == "✅" || Constants.WHITELISTED_BOTS.includes(message.author.id)) {
    await addExpiry(cmd.name, message.member, 300);
    [level, prestige] = await Promise.all([getLevel(message.member), getPrestige(message.member)]);

    if (level < 100) return msg.edit({ embeds: [new ErrorEmbed("lol nice try loser")] });

    const [upgrades] = await Promise.all([
      getUpgrades(message.member),
      setLevel(message.member, level - 100),
      setPrestige(message.member, prestige + 1),
    ]);

    const upgradesPool: string[] = [];
    let attempts = 0;

    while (upgradesPool.length === 0 && attempts < 50) {
      attempts++;
      for (const upgrade of Object.values(getUpgradesData())) {
        if (
          upgrades.find((i) => i.upgradeId === upgrade.id) &&
          upgrades.find((i) => i.upgradeId === upgrade.id).amount >= upgrade.max
        )
          continue;

        if (percentChance(upgrade.chance)) {
          upgradesPool.push(upgrade.id);
        }
      }
    }

    const chosen =
      upgradesPool.length > 0 ? upgradesPool[Math.floor(Math.random() * upgradesPool.length)] : "";

    if (chosen)
      await setUpgrade(
        message.member,
        chosen,
        upgrades.find((i) => i.upgradeId === chosen)
          ? upgrades.find((i) => i.upgradeId === chosen).amount + 1
          : 1,
      );

    const desc: string[] = [];

    if (chosen) {
      desc.push(`you have received the ${getUpgradesData()[chosen].name} upgrade`);
    } else {
      desc.push("you didn't find an upgrade this prestige ):");
    }

    return msg.edit({
      embeds: [
        new CustomEmbed()
          .setHeader("prestige", message.author.avatarURL())
          .setColor(Constants.EMBED_SUCCESS_COLOR)
          .setDescription(
            `you are now **prestige ${prestige + 1} level ${level - 100}**\n\n${desc.join("\n")}`,
          ),
      ],
      components: [],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;
