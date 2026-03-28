import {
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ContainerBuilder,
  Interaction,
  MessageFlags,
  resolveColor,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from "discord.js";
import { ToolPreferenceSelection } from "#generated/prisma";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { getColor } from "../models/EmbedBuilders";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  getToolPreferences,
  setToolPreference,
  toggleToolPreference,
} from "../utils/functions/economy/tool_preferences";
import { getItems } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command(
  "tools",
  "set what tools you want to use to fish/hunt/mine",
  "money",
).setAliases(["tool"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 15);

  const items = getItems();
  let inventory = await getInventory(message.member);

  let preferences = await getToolPreferences(message.member);

  const getLabel = (type: "gun" | "pickaxe" | "rod", selection: ToolPreferenceSelection) => {
    const terribleCount = inventory.count(
      type == "gun" ? "terrible_gun" : type == "rod" ? "terrible_fishing_rod" : "wooden_pickaxe",
    );
    const normalCount = inventory.count(
      type == "gun" ? "gun" : type == "rod" ? "fishing_rod" : "iron_pickaxe",
    );
    const incredibleCount = inventory.count(
      type == "gun"
        ? "incredible_gun"
        : type == "rod"
          ? "incredible_fishing_rod"
          : "diamond_pickaxe",
    );

    switch (selection) {
      case "terrible":
        return `${type == "pickaxe" ? "wooden" : "terrible"} [${terribleCount.toLocaleString()} in inventory]`;
      case "normal":
        return `${type == "pickaxe" ? "iron" : "normal"} [${normalCount.toLocaleString()} in inventory]`;
      case "incredible":
        return `${type == "pickaxe" ? "diamond" : "incredible"} [${incredibleCount.toLocaleString()} in inventory]`;
      case "highest":
        return `best available [${(terribleCount + normalCount + incredibleCount).toLocaleString()} total]`;
    }
  };

  const getEmoji = (type: "gun" | "pickaxe" | "rod", level: ToolPreferenceSelection) => {
    if (type == "gun") return items["gun"].emoji;
    if (type == "rod") return items["fishing_rod"].emoji;

    if (level == "terrible") return items["wooden_pickaxe"].emoji;
    if (level == "normal") return items["iron_pickaxe"].emoji;
    return items["diamond_pickaxe"].emoji;
  };

  const selectRow = (
    type: "gun" | "pickaxe" | "rod",
    current: ToolPreferenceSelection,
    disabled = false,
  ) => {
    return new StringSelectMenuBuilder()
      .setCustomId(`select-${type}`)
      .setDisabled(disabled)
      .addOptions(
        (["highest", "incredible", "normal", "terrible"] as ToolPreferenceSelection[]).map(
          (value) => {
            return new StringSelectMenuOptionBuilder()
              .setLabel(getLabel(type, value))
              .setValue(value)
              .setDefault(current === value)
              .setEmoji(getEmoji(type, value));
          },
        ),
      );
  };

  const toggleButton = (button: "unbreaking" | "lower", disabled = false) =>
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          button == "unbreaking"
            ? `use the best tool with unbreaking active`
            : `automatically use a lower tool if you run out\nof the currently selected tool`,
        ),
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`toggle-${button}`)
          .setLabel(
            button == "unbreaking"
              ? preferences.useBestToolOnUnbreaking
                ? "on"
                : "off"
              : preferences.useLowerToolOnEmpty
                ? "on"
                : "off",
          )
          .setStyle(
            button == "unbreaking"
              ? preferences.useBestToolOnUnbreaking
                ? ButtonStyle.Success
                : ButtonStyle.Danger
              : preferences.useLowerToolOnEmpty
                ? ButtonStyle.Success
                : ButtonStyle.Danger,
          )
          .setDisabled(disabled),
      );

  const container = (disabled = false) =>
    new ContainerBuilder()
      .setAccentColor(resolveColor(getColor(message.member)))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("## tool preferences"))
      .addSectionComponents(toggleButton("unbreaking", disabled))
      .addSeparatorComponents((separator) => separator.setDivider(false))
      .addSectionComponents(toggleButton("lower", disabled))
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "what level of tool you want to use when fishing/hunting/mining?",
        ),
      )
      .addActionRowComponents((row) =>
        row.addComponents(selectRow("rod", preferences.preferredRod, disabled)),
      )
      .addActionRowComponents((row) =>
        row.addComponents(selectRow("gun", preferences.preferredGun, disabled)),
      )
      .addActionRowComponents((row) =>
        row.addComponents(selectRow("pickaxe", preferences.preferredPickaxe, disabled)),
      );

  const msg = await send({
    flags: MessageFlags.IsComponentsV2,
    components: [container()],
  });

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
      const value = interaction.values[0] as ToolPreferenceSelection;

      await setToolPreference(
        message.member,
        interaction.customId.split("-")[1] as "gun" | "pickaxe" | "rod",
        value,
      );
    } else if (res == "toggle-unbreaking") {
      await toggleToolPreference(
        message.member,
        "unbreaking",
        !preferences.useBestToolOnUnbreaking,
      );
    } else if (res == "toggle-lower") {
      await toggleToolPreference(message.member, "lower", !preferences.useLowerToolOnEmpty);
    }
    preferences = await getToolPreferences(message.member);
    inventory = await getInventory(message.member);
    await msg.edit({ flags: MessageFlags.IsComponentsV2, components: [container()] });
    return pageManager();
  };

  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
