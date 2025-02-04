import { Captcha } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Message,
  MessageActionRowComponentBuilder,
  WebhookClient,
} from "discord.js";
import prisma from "../../init/database";
import redis from "../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../models/Command";
import { CustomEmbed } from "../../models/EmbedBuilders";
import Constants from "../Constants";
import { getTimestamp } from "../logger";
import { MStoTime } from "./date";
import { isEcoBanned, setEcoBan } from "./economy/utils";
import { addNotificationToQueue } from "./users/notifications";
import ms = require("ms");
import dayjs = require("dayjs");

type CaptchaType2 = {
  type: 2;
  id: string;
};

export async function isLockedOut(userId: string): Promise<false | CaptchaType2> {
  const cache = await redis.get(`${Constants.redis.nypsi.LOCKED_OUT}:${userId}`);
  if (!cache) return false;

  return JSON.parse(cache);
}

export async function giveCaptcha(userId: string, type: 1 | 2 = 2, force = false) {
  if (!force && (await isVerified(userId))) return false;

  if (type === 2) {
    const id = await prisma.captcha.create({
      data: {
        userId,
      },
      select: {
        id: true,
      },
    });
    await redis.set(
      `${Constants.redis.nypsi.LOCKED_OUT}:${userId}`,
      JSON.stringify({ type: 2, id: id.id }),
    );
  }

  return true;
}

async function isVerified(id: string) {
  return await redis.exists(`${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${id}`);
}

export async function passedCaptcha(member: GuildMember, check: Captcha) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (await redis.exists(`${Constants.redis.cache.user.captcha_pass}:${member.user.id}`)) {
    await redis.incr(`${Constants.redis.cache.user.captcha_pass}:${member.user.id}`);
  } else {
    await redis.set(
      `${Constants.redis.cache.user.captcha_pass}:${member.user.id}`,
      1,
      "EX",
      Math.floor(ms("1 day") / 1000),
    );
  }

  const timeTakenToSolve = check.solvedAt.getTime() - check.createdAt.getTime();

  await hook.send(
    `[${getTimestamp()}] **${member.user.username}** (${
      member.user.id
    }) has passed a captcha [${await redis.get(
      `${Constants.redis.cache.user.captcha_pass}:${member.user.id}`,
    )}]\n` +
      "```" +
      `received: ${check.received}\n` +
      `received at: ${dayjs(check.createdAt).format("HH:mm:ss")}\n` +
      `visits (${check.visits.length}): ${check.visits.map((i) => dayjs(i).format("HH:mm:ss")).join(" ")}\n` +
      `solved at: ${dayjs(check.solvedAt).format("HH:mm:ss")}\n` +
      `time taken: ${MStoTime(timeTakenToSolve)}\n` +
      "```",
  );

  let ttl = Math.floor(ms("30 minutes") / 1000);

  if (check.received > 1) ttl = Math.floor(ms("10 minutes") / 1000);
  else if (check.received > 3) ttl = Math.floor(ms("5 minutes") / 1000);
  else if (check.received > 5) ttl = 1;

  await redis.set(
    `${Constants.redis.nypsi.CAPTCHA_VERIFIED}:${member.user.id}`,
    member.user.id,
    "EX",
    ttl,
  );

  hook.destroy();
}

export async function failedCaptcha(member: GuildMember, content: string) {
  const hook = new WebhookClient({
    url: process.env.ANTICHEAT_HOOK,
  });

  if (await redis.exists(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) {
    const ttl = await redis.ttl(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`);
    await redis.set(
      `${Constants.redis.cache.user.captcha_fail}:${member.user.id}`,
      parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) + 1,
      "EX",
      ttl,
    );
  } else {
    await redis.set(
      `${Constants.redis.cache.user.captcha_fail}:${member.user.id}`,
      1,
      "EX",
      Math.floor(ms("1 day") / 1000),
    );
  }

  if (
    parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) >=
      50 &&
    !(await isEcoBanned(member.user.id)).banned
  ) {
    await setEcoBan(member.user.id, dayjs().add(1, "day").toDate());
    await hook.send(
      `[${getTimestamp()}] **${member.user.username}** (${
        member.user.id
      }) has been banned for 24 hours for failing 50 captchas`,
    );
    addNotificationToQueue({
      memberId: member.user.id,
      payload: {
        content: `you have been banned from nypsi economy for 24 hours for failing too many captchas`,
      },
    });
  }

  await hook.send(
    `[${getTimestamp()}] **${member.user.username}** (${
      member.user.id
    }) has failed/ignored a captcha (${content}) [${parseInt(
      await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`),
    )}]${
      parseInt(await redis.get(`${Constants.redis.cache.user.captcha_fail}:${member.user.id}`)) %
        15 ===
        0 && !(await isEcoBanned(member.user.id)).banned
        ? " <@&1091314758986256424>"
        : ""
    }`,
  );
  hook.destroy();
}

export async function verifyUser(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
) {
  const res = await isLockedOut(message.author.id);

  if (!res) return;

  const check = await prisma.captcha.findUnique({
    where: { id: res.id },
  });

  if (check.solved) {
    await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${message.author.id}`);
    passedCaptcha(message.member, check);
    return true;
  }

  const embed = new CustomEmbed(message.member).setTitle("you have been locked");

  embed.setDescription(
    "**you must complete a captcha to continue using commands**\n\n" +
      "please note that using macros / auto typers is not allowed with nypsi" +
      "\n*if you fail or ignore too many captchas you may be banned*" +
      `\n\nclick the button below to solve the captcha`,
  );
  embed.setColor(Constants.EMBED_FAIL_COLOR);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setURL(`https://nypsi.xyz/captcha?id=${res.id}`)
      .setStyle(ButtonStyle.Link)
      .setLabel("click me"),
  );

  const msg =
    message instanceof Message
      ? await message.reply({ embeds: [embed], components: [row] })
      : await message
          .reply({ embeds: [embed], components: [row], ephemeral: true })
          .then(() => message.fetchReply());

  const query = await prisma.captcha.update({
    where: { id: res.id },
    data: { received: { increment: 1 } },
  });

  if (query.solved) {
    if (message instanceof Message) {
      await msg
        .edit({
          embeds: [
            new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR).setDescription("✅ verified"),
          ],
        })
        .catch(() => {});
    } else {
      await message.followUp({
        embeds: [
          new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR).setDescription("✅ verified"),
        ],
      });
    }

    await redis.del(`${Constants.redis.nypsi.LOCKED_OUT}:${message.author.id}`);
    passedCaptcha(message.member, query);

    return true;
  } else if (query.received > 1) {
    failedCaptcha(message.member, message.content);
    return false;
  }

  return false;
}
