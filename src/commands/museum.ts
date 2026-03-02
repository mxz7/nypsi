import { CommandInteraction, ContainerBuilder, Interaction, Message, MessageFlags, resolveColor, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextDisplayBuilder } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { getColor } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("museum", "view your museum progress", "money");

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  //TODO: change where this is + duration
  await addCooldown(cmd.name, message.member, 1);

  const items = getItems();

  const itemRoles = [
    ...new Set(
      Object.values(items)
        .map(item => item.museum?.category)
        .filter(Boolean)
    )
  ].sort();

  console.log({itemRoles})
  
  let inventory = await getInventory(message.member);

  const roleSelectMenu = (
    disabled = false,
    selected = "none"
  ) => {
    return new StringSelectMenuBuilder()
      .setCustomId(`select-role`)
      .setDisabled(disabled)
      .addOptions(
        itemRoles.map(
          (role) => {
            return new StringSelectMenuOptionBuilder()
              .setLabel(role)
              .setValue(role)
              .setDefault(role == selected);
          },
        ),
      );
  };

  const container = (disabled = false) =>
    new ContainerBuilder()
      .setAccentColor(resolveColor(getColor(message.member)))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## museum"))
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "select a category of item",
        ),
      )
      .addActionRowComponents((row) =>
        row.addComponents(roleSelectMenu(disabled)),
      )

  let msg: Message;

  const homeView = async () => {
    if (msg) {
      await msg.edit({
      flags: MessageFlags.IsComponentsV2,
      components: [container()],
    });
    } else {
      msg = await send({
      flags: MessageFlags.IsComponentsV2,
      components: [container()],
    });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      let fail = false;

      const response = await msg
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          await collected.deferUpdate().catch(() => {
            fail = true;
            return pageManager();
          });
          return { res: collected.customId, interaction: collected };
        })
        .catch(async () => {
          fail = true;
          await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container(true)] });
        });

      if (fail) return;
      if (!response) return;

      const { res, interaction } = response;

      if (interaction.isStringSelectMenu()) {
        
      }

      inventory = await getInventory(message.member);
      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };
  }

  const categoryView = () => {

  }

  if (args[0]?.toLowerCase() == "donate") {

  } else if (args.length >= 2 && args[0].toLowerCase() == "view") {

  } else return homeView();
}

cmd.setRun(run);

module.exports = cmd;
