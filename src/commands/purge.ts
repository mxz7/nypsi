import dayjs = require("dayjs");
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  InteractionResponse,
  Message,
  MessageEditOptions,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("purge", "bulk delete/purge messages", "moderation")
  .setAliases(["del"])
  .setPermissions(["MANAGE_MESSAGES"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((messages) =>
    messages
      .setName("messages")
      .setDescription("delete messages from current channel")
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("amount of messages to delete").setRequired(true),
      ),
  )
  .addSubcommand((member) =>
    member
      .setName("member")
      .setDescription("delete messages by a specific member")
      .addUserOption((option) =>
        option
          .setName("member")
          .setDescription("member you want to delete messages from")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("amount of messages you want to delete")
          .setRequired(true),
      ),
  )
  .addSubcommand((bot) =>
    bot
      .setName("bot")
      .setDescription("delete messages by bots")
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("amount of messages to delete").setRequired(true),
      ),
  )
  .addSubcommand((includes) =>
    includes
      .setName("includes")
      .setDescription("delete messages including specific text")
      .addStringOption((option) =>
        option.setName("includes").setDescription("text to search for").setRequired(true),
      )
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("amount of messages to delete").setRequired(true),
      ),
  )
  .addSubcommand((clean) =>
    clean.setName("clean").setDescription("clean up bot commands and responses"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return;
  }

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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

  const edit = async (data: MessageEditOptions, msg?: Message | InteractionResponse) => {
    if (!(message instanceof Message)) {
      return await message.editReply(data);
    } else {
      if (msg instanceof InteractionResponse) return;
      return await msg.edit(data);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  const deleteAnyMessages = async (amount: number) => {
    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (amount <= 100) {
      await message.channel.bulkDelete(amount, true).catch(() => {});
      if (!(message instanceof Message)) {
        return send({
          embeds: [new CustomEmbed(message.member, "✅ messages deleted")],
          ephemeral: true,
        });
      }
    } else {
      amount = amount - 1;

      const amount1 = amount;
      let fail = false;
      let counter = 0;

      if (amount > 10000) {
        amount = 10000;
      }

      const embed = new CustomEmbed(
        message.member,
        "deleting `" +
          amount +
          "` messages..\n- if you'd like to cancel this operation, delete this message",
      ).setHeader("purge", message.author.avatarURL());

      const m = await send({ embeds: [embed] });
      for (let i = 0; i < amount1 / 100; i++) {
        if (amount < 10) return await m.delete().catch(() => {});

        if (amount <= 100) {
          let messages = await message.channel.messages.fetch({ limit: amount, before: m.id });

          messages = messages.filter((m) => {
            return dayjs().subtract(14, "days").isBefore(m.createdTimestamp);
          });

          await message.channel.bulkDelete(messages).catch(() => {});
          return await m.delete().catch(() => {});
        }

        let messages = await message.channel.messages.fetch({ limit: 100, before: m.id });

        messages = messages.filter((m) => {
          return dayjs().subtract(14, "days").isBefore(m.createdTimestamp);
        });

        if (messages.size < 100) {
          amount = messages.size;
          counter = 0;
          embed.setDescription(
            "deleting `" +
              amount +
              " / " +
              amount1 +
              "` messages..\n- if you'd like to cancel this operation, delete this message",
          );
          let stop = false;
          await edit({ embeds: [embed] }, m).catch(() => {
            stop = true;
            embed.setDescription("✅ operation cancelled");
            message.channel.send({ embeds: [embed] }).then((m) => {
              setTimeout(() => {
                m.delete().catch(() => {});
              }, 2000);
            });
          });
          if (stop) return;
        }

        await message.channel.bulkDelete(messages).catch(() => {
          fail = true;
        });

        if (fail) {
          return;
        }

        amount = amount - 100;
        counter++;

        if (counter >= 2) {
          counter = 0;
          embed.setDescription(
            "deleting `" +
              amount +
              " / " +
              amount1 +
              "` messages..\n- if you'd like to cancel this operation, delete this message",
          );
          let stop = false;
          await edit({ embeds: [embed] }, m).catch(() => {
            stop = true;
            embed.setDescription("✅ operation cancelled");
            message.channel.send({ embeds: [embed] }).then((m) => {
              setTimeout(() => {
                m.delete().catch(() => {});
              }, 2000);
            });
          });
          if (stop) return;
        }
      }
      if (!(message instanceof Message)) {
        message
          .editReply({ embeds: [new CustomEmbed(message.member, "operation complete (:")] })
          .catch(() => {});
      }
      return m.delete().catch(() => {});
    }
  };

  const deleteMemberMessages = async (member: string, amount: number) => {
    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (message instanceof Message) {
      await message.delete();
    } else {
      await send({
        embeds: [new CustomEmbed(message.member, "deleting messages...")],
        ephemeral: true,
      });
    }

    let collected = await message.channel.messages.fetch({ limit: 100 });

    collected = collected.filter((msg: Message) => {
      if (!msg.author) return;
      return msg.author.id == member;
    });

    if (collected.size == 0) {
      return;
    }

    let count = 0;

    for (const m of collected.keys()) {
      const msg = collected.get(m);
      if (count >= amount) {
        collected.delete(msg.id);
      } else {
        count++;
      }
    }

    await message.channel.bulkDelete(collected);

    if (!(message instanceof Message)) {
      return edit({
        embeds: [new CustomEmbed(message.member, `✅ **${collected.size}** messages deleted`)],
      });
    }
  };

  const deleteBotMessages = async (amount: number) => {
    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (message instanceof Message) {
      await message.delete();
    } else {
      await send({
        embeds: [new CustomEmbed(message.member, "deleting messages...")],
        ephemeral: true,
      });
    }

    let collected = await message.channel.messages.fetch({ limit: 100 });

    collected = collected.filter((msg: Message) => msg.author.bot);

    if (collected.size == 0) {
      return;
    }

    let count = 0;

    for (const m of collected.keys()) {
      const msg = collected.get(m);
      if (count >= amount) {
        collected.delete(msg.id);
      } else {
        count++;
      }
    }

    await message.channel.bulkDelete(collected);

    if (!(message instanceof Message)) {
      return edit({
        embeds: [new CustomEmbed(message.member, `✅ **${collected.size}** messages deleted`)],
      });
    }
  };

  const deleteIncludesMessages = async (text: string, amount: number) => {
    if (!message.channel.isTextBased()) return;
    if (message.channel.isDMBased()) return;

    if (message instanceof Message) {
      await message.delete();
    } else {
      await send({
        embeds: [new CustomEmbed(message.member, "deleting messages...")],
        ephemeral: true,
      });
    }

    let collected = await message.channel.messages.fetch({ limit: 100 });

    collected = collected.filter((msg: Message) =>
      msg.content.toLowerCase().includes(text.toLowerCase()),
    );

    if (collected.size == 0) {
      return;
    }

    let count = 0;

    for (const m of collected.keys()) {
      const msg = collected.get(m);
      if (count >= amount) {
        collected.delete(msg.id);
      } else {
        count++;
      }
    }

    await message.channel.bulkDelete(collected);

    if (!(message instanceof Message)) {
      return edit({
        embeds: [new CustomEmbed(message.member, `✅ **${collected.size}** messages deleted`)],
      });
    }
  };

  const helpMenu = async () => {
    const embed = new CustomEmbed(message.member).setHeader("purge", message.author.avatarURL());

    const prefix = (await getPrefix(message.guild))[0];

    embed.setDescription(
      `${prefix}**purge <number>** *delete messages from current channel*\n` +
        "/**purge messages <amount>** *delete messages from current channel*\n" +
        "/**purge member <@member> <amount>** *delete messages by a specific member*\n" +
        "/**purge bot <amount>** *delete messages by bots*\n" +
        "/**purge includes <text> <amount>** *delete messages containing certain text*\n" +
        "/**purge clean** *clean up bot commands and responses*",
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) return helpMenu();

  if (parseInt(args[0])) {
    let amount = parseInt(args[0]);

    if (amount < 60) amount++;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      if (amount > 100) {
        amount = 100;
      }
    }

    await addCooldown(cmd.name, message.member, 10);

    return deleteAnyMessages(amount);
  } else if (args[0].toLowerCase() == "messages") {
    let amount = parseInt(args[1]);

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount < 60) amount++;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      if (amount > 100) {
        amount = 100;
      }
    }

    await addCooldown(cmd.name, message.member, 10);

    return deleteAnyMessages(amount);
  } else if (args[0].toLowerCase() === "member" || args[0].toLowerCase() === "user") {
    let memberId: string;

    if (!message.mentions?.members.first()) {
      if (args[1].match(Constants.SNOWFLAKE_REGEX)) memberId = args[1];
      memberId = (await getMember(message.guild, args[1]))?.id;
    } else {
      memberId = message.mentions.members.first()?.id;
    }

    if (!memberId) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    let amount = parseInt(args[2]);

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > 100) amount = 100;

    await addCooldown(cmd.name, message.member, 10);

    return deleteMemberMessages(memberId, amount);
  } else if (args[0].toLowerCase() == "bot") {
    let amount = parseInt(args[1]);

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > 100) amount = 100;

    await addCooldown(cmd.name, message.member, 10);

    return deleteBotMessages(amount);
  } else if (args[0].toLowerCase() == "includes") {
    if (message instanceof Message)
      return send({ embeds: [new ErrorEmbed("please use /purge includes")] });

    if (!message.isChatInputCommand()) return;

    const text = message.options.getString("includes");

    let amount = message.options.getInteger("amount");

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (amount > 100) amount = 100;

    await addCooldown(cmd.name, message.member, 10);

    return deleteIncludesMessages(text, amount);
  } else if (args[0].toLowerCase() == "clean") {
    await addCooldown(cmd.name, message.member, 15);

    const prefix = await getPrefix(message.guild);

    let amount = 50;

    if (args[0] && parseInt(args[0]) && !isNaN(parseInt(args[0]))) {
      amount = parseInt(args[0]);

      if (amount < 2 || amount > 100) amount = 50;
    }

    if (!message.channel.isTextBased()) return;

    if (message.channel.isDMBased()) return;

    const collected = await message.channel.messages.fetch({ limit: amount });

    const collecteda = collected.filter(
      (msg) =>
        msg.author.id == message.client.user.id ||
        prefix.map((i) => msg.content.startsWith(i)).filter((i) => i).length > 0,
    );

    await message.channel.bulkDelete(collecteda);

    return send({
      embeds: [new CustomEmbed(message.member, `✅ ${collecteda.size} messages cleaned up`)],
      ephemeral: true,
    }).then((m) => {
      setTimeout(() => {
        m.delete().catch(() => {});
      }, 1500);
    });
  } else {
    return helpMenu();
  }
}

cmd.setRun(run);

module.exports = cmd;
