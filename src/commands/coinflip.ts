import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  GuildMember,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { randomInt } from "node:crypto";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { Item } from "../types/Economy";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  removeBalance,
} from "../utils/functions/economy/balance";
import { addEventProgress, EventData, getCurrentEvent } from "../utils/functions/economy/events";
import {
  addInventoryItem,
  getInventory,
  removeInventoryItem,
  selectItem,
} from "../utils/functions/economy/inventory";
import { createGame } from "../utils/functions/economy/stats";
import { createUser, formatBet, isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getMember } from "../utils/functions/member.js";
import { isPremium } from "../utils/functions/premium/premium";
import { addToNypsiBank, getTax } from "../utils/functions/tax";
import { getPreferences } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler.js";
import { gamble } from "../utils/logger.js";

const cmd = new Command("coinflip", "flip a coin, double or nothing", "money").setAliases(["cf"]);

const playing = new Set<string>();

cmd.slashEnabled = true;
cmd.slashData
  .addUserOption((option) =>
    option.setName("user").setDescription("user you want to challenge").setRequired(false),
  )
  .addStringOption((option) =>
    option.setName("bet").setDescription("how much do you want to bet").setRequired(false),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await userExists(message.member))) {
    await createUser(message.member);
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (args.length == 0) {
    const embed = new CustomEmbed(message.member)
      .setHeader("coinflip help")
      .setDescription("/coinflip user bet");

    return send({ embeds: [embed] });
  }

  const doGame = async (
    player1: GuildMember,
    player2: GuildMember,
    type: "money" | "item",
    response: ButtonInteraction,
    msg: Message,
    bet?: number,
    item?: Item,
    itemAmount?: number,
  ) => {
    const player2Inventory = await getInventory(player2);

    if (type === "money") {
      if (bet > (await getBalance(player2))) {
        await addBalance(player1.user, bet);
        return response.editReply({
          embeds: [new ErrorEmbed(`${player2.user.toString()} cannot afford this bet`)],
        });
      }

      await removeBalance(player2, bet);
    } else {
      if (player2Inventory.count(item.id) < itemAmount) {
        await addInventoryItem(player1, item.id, itemAmount);
        return response.editReply({
          embeds: [new ErrorEmbed(`${player2.user.toString()} does not have enough ${item.name}`)],
        });
      }

      await removeInventoryItem(player2, item.id, itemAmount);
    }

    // its big to make sure that theres little to no deviation in chance cus of rounding
    const lols = [
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
      "heads",
      "tails",
    ];
    const choice = lols[randomInt(lols.length)];
    let thingy = `${player1.user.username.replace("_", "\\_")}\n${player2.user.username.replace("_", "\\_")}`;

    let winner: GuildMember;
    let loser: GuildMember;

    if (choice == "heads") {
      winner = player1;
      loser = player2;
    } else {
      winner = player2;
      loser = player1;
    }

    const embed = new CustomEmbed(message.member).setHeader("coinflip");

    if (type === "money") {
      embed.setDescription(`*throwing..*\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}`);
    } else {
      embed.setDescription(
        `*throwing..*\n\n${thingy}\n\n` +
          `**bet** ${itemAmount.toLocaleString()}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**`,
      );
    }

    if (response.replied) {
      msg = await msg.reply({ embeds: [embed] });
    } else {
      msg = await response
        .reply({ embeds: [embed] })
        .then((m) => m.fetch())
        .catch(async () => (msg = await msg.reply({ embeds: [embed] })));
    }

    if (type === "money") {
      let winnings = bet * 2;
      let tax = 0;

      if (winnings > 1_000_000 && !(await isPremium(winner))) {
        tax = await getTax();

        const taxed = Math.floor(winnings * tax);
        await addToNypsiBank(taxed * 0.5);
        winnings -= taxed;
      }

      const id = await createGame({
        userId: message.author.id,
        bet: bet,
        game: "coinflip",
        outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username}`,
        result: winner.user.id == message.author.id ? "win" : "lose",
        earned: winner.user.id == message.author.id ? winnings : null,
      });

      const eventProgress = await addEventProgress(
        message.client as NypsiClient,
        winner,
        "coinflip",
        1,
      );

      await createGame({
        userId: player2.user.id,
        bet: bet,
        game: "coinflip",
        outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username}`,
        result: winner.user.id == player2.user.id ? "win" : "lose",
        earned: winner.user.id == player2.user.id ? winnings : null,
      });

      gamble(winner.user, "coinflip", bet, "win", id, bet * 2);
      gamble(loser.user, "coinflip", bet, "lose", id);

      await addBalance(winner, winnings);

      if (winner == message.member) {
        thingy = `**${message.author.username.replace("_", "\\_")}** +$${winnings.toLocaleString()}${
          tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""
        }\n${player2.user.username.replace("_", "\\_")}`;
      } else {
        thingy = `${message.author.username.replace("_", "\\_")}\n**${player2.user.username.replace(
          "_",
          "\\_",
        )}** +$${winnings.toLocaleString()}${tax ? ` (${(tax * 100).toFixed(1)}% tax)` : ""}`;
      }

      const eventData: { event?: EventData; target: number } = { target: 0 };

      if (eventProgress) {
        eventData.event = await getCurrentEvent();

        if (eventData.event) {
          eventData.target = Number(eventData.event.target);
        }
      }

      embed.setDescription(
        `**winner** ${winner.user.username.replace("_", "\\_")}\n\n${thingy}\n\n**bet** $${bet.toLocaleString()}` +
          (eventProgress
            ? `\n\n🔱 ${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`
            : ""),
      );
      embed.setColor(winner.displayHexColor);
      embed.setFooter({ text: `id: ${id}` });
    } else {
      const id = await createGame({
        userId: message.author.id,
        bet: 0,
        game: "coinflip",
        outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username} (${itemAmount}x ${item.id})`,
        result: winner.user.id == message.author.id ? "win" : "lose",
        earned: 0,
        xp: 0,
      });

      const eventProgress = await addEventProgress(
        message.client as NypsiClient,
        winner,
        "coinflip",
        1,
      );

      await createGame({
        userId: player2.user.id,
        bet: 0,
        game: "coinflip",
        outcome: `**winner** ${winner.user.username}\n**loser** ${loser.user.username} (${itemAmount}x ${item.id})`,
        result: winner.user.id == player2.user.id ? "win" : "lose",
      });

      gamble(winner.user, "coinflip", 0, "win", id, 0);
      gamble(loser.user, "coinflip", 0, "lose", id);

      await addInventoryItem(winner, item.id, itemAmount * 2);

      if (winner == message.member) {
        thingy = `**${message.author.username.replace("_", "\\_")}** +${(itemAmount * 2).toLocaleString()}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**\n${player2.user.username.replace("_", "\\_")}`;
      } else {
        thingy = `${message.author.username.replace("_", "\\_")}\n**${player2.user.username.replace(
          "_",
          "\\_",
        )}** +${(itemAmount * 2).toLocaleString()}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**`;
      }

      const eventData: { event?: EventData; target: number } = { target: 0 };

      if (eventProgress) {
        eventData.event = await getCurrentEvent();

        if (eventData.event) {
          eventData.target = Number(eventData.event.target);
        }
      }

      embed.setDescription(
        `**winner** ${winner.user.username.replace("_", "\\_")}\n\n${thingy}\n\n**bet** ${itemAmount.toLocaleString()}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**` +
          (eventProgress
            ? `\n\n🔱 ${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`
            : ""),
      );
      embed.setColor(winner.displayHexColor);
      embed.setFooter({ text: `id: ${id}` });
    }

    setTimeout(() => {
      return msg.edit({ embeds: [embed] });
    }, 2000);
  };

  const memberMaxBet = (await calcMaxBet(message.member)) * 10;

  let bet: number;
  let item: Item;
  let itemAmount: number;
  let target: GuildMember;

  bet = await formatBet(args[0], message.member, 10_000_000_000);

  if (!bet || isNaN(bet)) {
    item = selectItem(args[0].toLowerCase());

    if (item) {
      itemAmount = parseInt(args[1] || "1");
      if (isNaN(itemAmount) || itemAmount <= 0) {
        itemAmount = 1;
      }
    } else {
      target = await getMember(message.guild, args[0]);
    }
  }

  if (!bet && !item && !target) {
    return send({ embeds: [new ErrorEmbed("$coinflip (user) <bet>")] });
  }

  if (!bet && !item) {
    if (args.length === 1) {
      return send({ embeds: [new ErrorEmbed("$coinflip (user) <bet>")] });
    }
    bet = await formatBet(args[1], message.member, 10_000_000_000);

    if (bet <= 0) bet = undefined;

    if (!bet || isNaN(bet)) {
      item = selectItem(args[1].toLowerCase());

      if (item) {
        itemAmount = parseInt(args[2] || "1");
        if (isNaN(itemAmount) || itemAmount <= 0) {
          itemAmount = 1;
        }
      }
    }
  }

  if (!bet && !item) {
    return send({ embeds: [new ErrorEmbed("$coinflip (user) <bet>")] });
  }

  if (item && item.account_locked) return send({ embeds: [new ErrorEmbed("invalid item")] });

  if (playing.has(message.author.id))
    return send({ embeds: [new ErrorEmbed("you already have an outstanding coinflip game")] });

  if (target) {
    if (message.member == target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (target.user.bot) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!(await getPreferences(target)).duelRequests) {
      return send({ embeds: [new ErrorEmbed(`${target.user.toString()} has requests disabled`)] });
    }

    if (playing.has(target.user.id))
      return send({
        embeds: [new ErrorEmbed("this user is waiting for a response on a coinflip")],
      });

    if ((await isEcoBanned(target)).banned) {
      return send({ embeds: [new ErrorEmbed("they are banned. lol.")] });
    }

    if (!(await userExists(target))) await createUser(target);

    const requestEmbed = new CustomEmbed(message.member).setFooter({
      text: "expires in 60 seconds",
    });

    let interaction: ButtonInteraction;

    if (bet) {
      if (bet > (await getBalance(message.member))) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
      }

      if (bet > (await getBalance(target))) {
        return send({
          embeds: [
            new ErrorEmbed(
              `**${target.user.username.replace("_", "\\_")}** cannot afford this bet`,
            ),
          ],
        });
      }

      if (bet > memberMaxBet) {
        const authorConfirmationEmbed = new CustomEmbed(
          message.member,
          `this will create a coinflip worth $**${bet.toLocaleString()}**. are you sure?`,
        );

        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("y").setLabel("yes").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("n").setLabel("no").setStyle(ButtonStyle.Danger),
        );

        const msg = await send({ embeds: [authorConfirmationEmbed], components: [row] });

        interaction = await msg
          .awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id,
            time: 30000,
            componentType: ComponentType.Button,
          })
          .catch((): null => {
            row.components.forEach((c) => c.setDisabled(true));
            msg.edit({ components: [row] });
            return null;
          });

        if (!interaction) return;

        if ((await getBalance(message.member)) < bet)
          return interaction.reply({ embeds: [new ErrorEmbed("nice try buddy")] });

        if (interaction.customId !== "y") {
          msg.edit({ components: [] });
          return interaction.reply({
            embeds: [new CustomEmbed(message.member, "✅ coinflip cancelled")],
          });
        }

        msg.edit({ components: [] });
      }

      await removeBalance(message.member, bet);
      requestEmbed.setDescription(
        `**${message.author.username.replace(
          "_",
          "\\_",
        )}** has challenged you to a coinflip\n\n**bet** $${bet.toLocaleString()}\n\ndo you accept?`,
      );
    } else {
      const userInventory = await getInventory(message.member);
      const targetInventory = await getInventory(target);

      if (userInventory.count(item.id) < itemAmount) {
        return send({
          embeds: [new ErrorEmbed(`you don't have enough ${item.name}`)],
        });
      }

      if (targetInventory.count(item.id) < itemAmount) {
        return send({
          embeds: [
            new ErrorEmbed(
              `**${target.user.username.replace("_", "\\_")}** doesn't have enough ${item.name}`,
            ),
          ],
        });
      }

      await removeInventoryItem(message.member, item.id, itemAmount);

      requestEmbed.setDescription(
        `**${message.author.username.replace(
          "_",
          "\\_",
        )}** has challenged you to a coinflip\n\n**bet** ${itemAmount}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**\n\ndo you accept?`,
      );
    }

    await addCooldown(cmd.name, message.member, 10);
    playing.add(message.author.id);
    setTimeout(() => {
      if (playing.has(message.author.id)) playing.delete(message.author.id);
    }, 120000);

    let cancelled = false;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger),
    );

    let msg: Message;

    if (interaction) {
      msg = await interaction
        .reply({
          content: `${target.user.toString()} you have been invited to a coinflip`,
          embeds: [requestEmbed],
          components: [row],
        })
        .then((m) => m.fetch())
        .catch(() =>
          send({
            content: `${target.user.toString()} you have been invited to a coinflip`,
            embeds: [requestEmbed],
            components: [row],
          }),
        );
    } else {
      msg = await send({
        content: `${target.user.toString()} you have been invited to a coinflip`,
        embeds: [requestEmbed],
        components: [row],
      });
    }

    let fail = false;
    let proceeded = false;
    const filter = async (i: ButtonInteraction) => {
      if (message.author.id === i.user.id) {
        return i.customId === "n";
      }

      if (playing.has(i.user.id)) {
        i.reply({
          embeds: [new ErrorEmbed("you already have an outstanding coinflip game")],
          flags: MessageFlags.Ephemeral,
        });
        return false;
      }

      if (i.user.id !== target.user.id) return false;

      if (i.customId == "n") return true;

      if (bet) {
        const maxBet = await calcMaxBet(i.user);

        if (bet > maxBet * 10) {
          const confirmEmbed = new CustomEmbed(
            i.user,
            `are you sure you want to accept? the bet is $**${bet.toLocaleString()}**`,
          );

          const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("y").setLabel("yes").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("n").setLabel("no").setStyle(ButtonStyle.Danger),
          );

          const confirmMsg = await i
            .reply({ embeds: [confirmEmbed], components: [row], flags: MessageFlags.Ephemeral })
            .then((m) => m.fetch());

          const confirmInteraction = await confirmMsg
            .awaitMessageComponent({
              filter: (i2) => i.user.id === i2.user.id,
              time: 15000,
              componentType: ComponentType.Button,
            })
            .catch(() => {});

          if (proceeded || fail) return false;

          if (!confirmInteraction) return false;

          if ((await getBalance(i.user)) < bet) {
            if (confirmInteraction.isRepliable())
              confirmInteraction.reply({
                embeds: [new ErrorEmbed("you cannot afford this bet")],
                flags: MessageFlags.Ephemeral,
              });
            return false;
          }

          confirmInteraction.update({ components: [] });

          return confirmInteraction.customId === "y";
        }
      }

      return true;
    };

    const response = await msg
      .awaitMessageComponent({ filter, time: 60000, componentType: ComponentType.Button })
      .then((collected) => {
        proceeded = true;
        msg.edit({ components: [] });
        playing.delete(message.author.id);
        return collected;
      })
      .catch(async () => {
        fail = true;
        playing.delete(message.author.id);
        if (!cancelled) {
          if (bet) await addBalance(message.member, bet);
          else await addInventoryItem(message.member, item.id, itemAmount);
        }
        msg.edit({ components: [] });
      });

    if (fail || !response) return;

    if (response.customId == "y") {
      if (bet) {
        return doGame(message.member, target, "money", response as ButtonInteraction, msg, bet);
      } else {
        return doGame(
          message.member,
          target,
          "item",
          response as ButtonInteraction,
          msg,
          null,
          item,
          itemAmount,
        );
      }
    } else {
      cancelled = true;
      if (bet) await addBalance(message.member, bet);
      else await addInventoryItem(message.member, item.id, itemAmount);
      if (message.author.id === response.user.id) {
        response
          .reply({
            embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
          })
          .catch(() => {
            msg.reply({
              embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
            });
          });
      } else {
        response
          .reply({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] })
          .catch(() => {
            msg.reply({
              embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
            });
          });
      }
    }
  } else {
    const requestEmbed = new CustomEmbed(message.member).setFooter({
      text: "expires in 60 seconds",
    });

    let interaction: ButtonInteraction;

    if (bet) {
      if (!bet) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
      }

      if (isNaN(bet)) {
        return send({ embeds: [new ErrorEmbed("invalid bet")] });
      }

      if (bet <= 0) {
        return send({ embeds: [new ErrorEmbed("/coinflip user bet")] });
      }

      if (bet > (await getBalance(message.member))) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this bet")] });
      }

      if (bet > memberMaxBet) {
        const authorConfirmationEmbed = new CustomEmbed(
          message.member,
          `this will create a coinflip worth $**${bet.toLocaleString()}**. are you sure?`,
        );

        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("y").setLabel("yes").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("n").setLabel("no").setStyle(ButtonStyle.Danger),
        );

        const msg = await send({ embeds: [authorConfirmationEmbed], components: [row] });

        interaction = await msg
          .awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id,
            time: 30000,
            componentType: ComponentType.Button,
          })
          .catch((): null => {
            row.components.forEach((c) => c.setDisabled(true));
            msg.edit({ components: [row] });
            return null;
          });

        if (!interaction) return;

        if ((await getBalance(message.member)) < bet)
          return interaction.reply({ embeds: [new ErrorEmbed("nice try buddy")] });

        if (interaction.customId !== "y") {
          msg.edit({ components: [] });
          return interaction.reply({
            embeds: [new CustomEmbed(message.member, "✅ coinflip cancelled")],
          });
        }

        msg.edit({ components: [] });
      }

      await removeBalance(message.member, bet);

      requestEmbed.setDescription(
        `**${message.author.username.replace(
          "_",
          "\\_",
        )}** has created an open coinflip\n\n**bet** $${bet.toLocaleString()}`,
      );
    } else {
      const userInventory = await getInventory(message.member);

      if (userInventory.count(item.id) < itemAmount) {
        return send({
          embeds: [new ErrorEmbed(`you don't have enough ${item.name}`)],
        });
      }

      await removeInventoryItem(message.member, item.id, itemAmount);

      requestEmbed.setDescription(
        `**${message.author.username.replace(
          "_",
          "\\_",
        )}** has created an open coinflip\n\n**bet** ${itemAmount}x ${item.emoji} **[${item.name}](https://nypsi.xyz/items/${item.id}?ref=bot-cf)**`,
      );
    }

    await addCooldown(cmd.name, message.member, 10);
    playing.add(message.author.id);
    setTimeout(() => {
      if (playing.has(message.author.id)) playing.delete(message.author.id);
    }, 120000);

    let cancelled = false;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("y").setLabel("play").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("n").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    let msg: Message;

    if (interaction) {
      msg = await interaction
        .reply({ embeds: [requestEmbed], components: [row] })
        .then((r) => r.fetch())
        .catch(() => send({ embeds: [requestEmbed], components: [row] }));
    } else {
      msg = await send({ embeds: [requestEmbed], components: [row] });
    }

    let proceeded = false;
    let fail = false;
    const filter = async (i: ButtonInteraction): Promise<boolean> => {
      if (i.customId === "n" && message.author.id !== i.user.id) return false;
      if (message.author.id === i.user.id) {
        return i.customId === "n";
      }
      if ((await isEcoBanned(i.user)).banned) return false;

      if (playing.has(i.user.id)) {
        i.reply({
          embeds: [new ErrorEmbed("you already have an outstanding coinflip game")],
          flags: MessageFlags.Ephemeral,
        });
        return false;
      }

      if (i.user.id === message.author.id) {
        return (i as ButtonInteraction).customId === "n";
      }

      if (!(await userExists(i.user))) {
        if (i.isRepliable())
          await i.reply({
            flags: MessageFlags.Ephemeral,
            embeds: [new ErrorEmbed("you cannot afford this bet")],
          });
        return false;
      }

      if (bet) {
        if ((await getBalance(i.user)) < bet) {
          if (i.isRepliable())
            i.reply({
              embeds: [new ErrorEmbed("you cannot afford this bet")],
              flags: MessageFlags.Ephemeral,
            });
          return false;
        }

        const maxBet = await calcMaxBet(i.user);

        if (bet > maxBet * 10) {
          const confirmEmbed = new CustomEmbed(
            i.user,
            `are you sure you want to accept? the bet is $**${bet.toLocaleString()}**`,
          );

          const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("y").setLabel("yes").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("n").setLabel("no").setStyle(ButtonStyle.Danger),
          );

          const confirmMsg = await i
            .reply({ embeds: [confirmEmbed], components: [row], flags: MessageFlags.Ephemeral })
            .then((m) => m.fetch());

          const confirmInteraction = await confirmMsg
            .awaitMessageComponent({
              filter: (i2) => i.user.id === i2.user.id,
              time: 15000,
              componentType: ComponentType.Button,
            })
            .catch(() => {});

          if (proceeded) return false;

          if (!confirmInteraction) return false;

          if ((await getBalance(i.user)) < bet) {
            if (confirmInteraction.isRepliable())
              confirmInteraction.reply({
                embeds: [new ErrorEmbed("you cannot afford this bet")],
                flags: MessageFlags.Ephemeral,
              });
            return false;
          }

          confirmInteraction.update({ components: [] });

          return confirmInteraction.customId === "y";
        }
      } else {
        const inventory = await getInventory(i.user);

        if (inventory.count(item.id) < itemAmount) {
          if (i.isRepliable())
            i.reply({
              embeds: [new ErrorEmbed(`you don't have enough ${item.name}`)],
              flags: MessageFlags.Ephemeral,
            });
          return false;
        }
      }

      return true;
    };

    const response = await msg
      .awaitMessageComponent({ filter, time: 60000, componentType: ComponentType.Button })
      .then((collected) => {
        proceeded = true;
        msg.edit({ components: [] });
        playing.delete(message.author.id);
        return collected;
      })
      .catch(async () => {
        fail = true;
        playing.delete(message.author.id);
        if (!cancelled) {
          if (bet) await addBalance(message.member, bet);
          else await addInventoryItem(message.member, item.id, itemAmount);
        }
        msg.edit({ components: [] });
      });

    if (fail || !response) return;

    const target = await message.guild.members.fetch(response.user.id);

    if (!target) return message.channel.send({ embeds: [new ErrorEmbed("invalid guild member")] });

    if (response.customId == "y") {
      if (bet) {
        return doGame(message.member, target, "money", response as ButtonInteraction, msg, bet);
      } else {
        return doGame(
          message.member,
          target,
          "item",
          response as ButtonInteraction,
          msg,
          null,
          item,
          itemAmount,
        );
      }
    } else {
      cancelled = true;
      if (bet) await addBalance(message.member, bet);
      else await addInventoryItem(message.member, item.id, itemAmount);
      if (message.author.id === response.user.id) {
        response
          .reply({
            embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
          })
          .catch(() => {
            msg.reply({
              embeds: [new CustomEmbed(message.member, "✅ coinflip request cancelled")],
            });
          });
      } else {
        response
          .reply({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] })
          .catch(() => {
            msg.reply({ embeds: [new CustomEmbed(target, "✅ coinflip request denied")] });
          });
      }
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
