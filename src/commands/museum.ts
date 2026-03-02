import {
  CommandInteraction,
  ContainerBuilder,
  Interaction,
  Message,
  MessageFlags,
  resolveColor,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed, getColor } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import { getItems } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("museum", "view your museum progress", "money");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((progress) =>
    progress.setName("donate").setDescription("donate an item to the museum"),
  )
  .addSubcommand((view) =>
    view
      .setName("view")
      .setDescription("view your museum")
      .addStringOption((option) =>
        option
          .setName("museum-category")
          .setDescription("the category you want to view")
          .setAutocomplete(true),
      ),
  );

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

  const itemCategories = [
    ...new Set(
      Object.values(items)
        .map((item) => item.museum?.category)
        .filter(Boolean),
    ),
  ].sort();

  itemCategories.unshift("home");

  let inventory = await getInventory(message.member);

  const categorySelectMenu = (disabled = false, selected = "home") => {
    return new StringSelectMenuBuilder()
      .setCustomId(`select-category`)
      .setDisabled(disabled)
      .addOptions(
        itemCategories.map((category) => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(category)
            .setValue(category)
            .setDefault(category == selected);
        }),
      );
  };

  const doCategorySelect = async (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu() || interaction.customId != "select-category")
      return false;
    return interaction.values[0];
  };

  let msg: Message;

  const homeView = async () => {
    const container = (disabled = false) =>
      new ContainerBuilder()
        .setAccentColor(resolveColor(getColor(message.member)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("## museum"))
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("select a category of item"))
        .addActionRowComponents((row) => row.addComponents(categorySelectMenu(disabled)));

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

      const categorySelect = await doCategorySelect(interaction);

      if (categorySelect) {
        inventory = await getInventory(message.member);
        return categoryView(categorySelect);
      }

      inventory = await getInventory(message.member);
      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  const categoryView = async (category: string) => {
    const container = (disabled = false) =>
      new ContainerBuilder()
        .setAccentColor(resolveColor(getColor(message.member)))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## museum - ${category}`))
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("select a category of item"))
        .addActionRowComponents((row) => row.addComponents(categorySelectMenu(disabled, category)));

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

      const categorySelect = await doCategorySelect(interaction);

      if (categorySelect) {
        inventory = await getInventory(message.member);
        return categorySelect == "home" ? homeView() : categoryView(categorySelect);
      }

      inventory = await getInventory(message.member);
      await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
      return pageManager();
    };

    return pageManager();
  };

  if (args[0]?.toLowerCase() == "donate") {
  } else if (args.length) {
    if (args[0]?.toLowerCase() == "view") args.shift();
    if (args.length == 0) return homeView();
    let category = args[0]?.toLowerCase();
    if (itemCategories.includes(category)) {
      return categoryView(category);
    } else return send({ embeds: [new ErrorEmbed(`could not find category \`${category}\``)] });
  } else return homeView();
}

cmd.setRun(run);

module.exports = cmd;
