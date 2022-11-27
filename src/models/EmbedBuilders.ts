import { ColorResolvable, EmbedBuilder, GuildMember } from "discord.js";
import redis from "../init/redis";
import Constants from "../utils/Constants";
import { getColor } from "../utils/functions/color";
import { getEmbedColor } from "../utils/functions/premium/color";
import ms = require("ms");

const embedColorCache = new Map<string, string>();

export class CustomEmbed extends EmbedBuilder {
  constructor(member?: GuildMember, text?: string, disableFooter = false) {
    super();

    if (member) {
      const color = embedColorCache.get(member.user.id) as ColorResolvable | "default" | "none";

      if (color && color != "none") {
        if (color == "default") {
          super.setColor(getColor(member));
        } else {
          super.setColor(color);
        }
      } else {
        checkPremium(member.user.id);
        super.setColor(getColor(member));
      }
    }

    if (text) {
      if (text.length > 2000) {
        text = text.substring(0, 2000);
      }

      super.setDescription(text);
    }

    const chance = Math.floor(Math.random() * 50);

    if (chance == 7 && !disableFooter)
      super.setFooter({
        text: "nypsi.xyz",
      });

    return this;
  }

  disableFooter() {
    try {
      delete this.data.footer;
    } catch {
      /* keep eslint happy */
    }

    return this;
  }

  setDescription(text: string) {
    if (text.length > 2000) {
      text = text.substr(0, 2000);
    }
    super.setDescription(text);

    return this;
  }

  addField(title: string, text: string, inline = false) {
    if (text.length > 1000) {
      text = text.substr(0, 1000);
    }

    if (super.data?.fields) {
      super.data.fields.push({ name: title, value: text, inline: inline });
    } else {
      super.addFields([{ name: title, value: text, inline: inline }]);
    }

    return this;
  }

  setTitle(text: string) {
    super.setTitle(text);

    return this;
  }

  setImage(url: string) {
    super.setImage(url);

    return this;
  }

  setThumbnail(url: string) {
    super.setThumbnail(url);

    return this;
  }

  setURL(url: string) {
    super.setURL(url);

    return this;
  }

  setHeader(text: string, image?: string) {
    super.setAuthor({ name: text, iconURL: image });

    return this;
  }

  setColor(color: `#${string}` | ColorResolvable) {
    super.setColor(color);

    return this;
  }

  setTimestamp(date?: Date | number) {
    if (date) {
      super.setTimestamp(date);
    } else {
      super.setTimestamp();
    }

    return this;
  }
}

export class ErrorEmbed extends EmbedBuilder {
  constructor(text: string) {
    super();
    super.setColor("#e31937");
    super.setTitle("`❌`");
    super.setDescription(text);

    return this;
  }

  removeTitle() {
    delete this.data.title;

    return this;
  }

  setDescription(text: string) {
    if (text.length > 2000) {
      text = text.substring(0, 2000);
    }
    super.setDescription(text);

    return this;
  }

  addField(title: string, text: string, inline = false) {
    if (text.length > 1000) {
      text = text.substr(0, 1000);
    }

    if (super.data?.fields) {
      super.data.fields.push({ name: title, value: text, inline: inline });
    } else {
      super.addFields([{ name: title, value: text, inline: inline }]);
    }

    return this;
  }

  setTitle(text: string) {
    super.setTitle(text);

    return this;
  }

  setImage(url: string) {
    super.setImage(url);

    return this;
  }

  setThumbnail(url: string) {
    super.setThumbnail(url);

    return this;
  }

  setURL(url: string) {
    super.setURL(url);

    return this;
  }

  setHeader(text: string): ErrorEmbed {
    super.setAuthor({ name: text });

    return this;
  }

  setColor(color: `#${string}` | ColorResolvable) {
    super.setColor(color);

    return this;
  }

  setTimestamp(date: Date | number) {
    if (date) {
      super.setTimestamp(date);
    } else {
      super.setTimestamp();
    }

    return this;
  }
}

async function checkPremium(id: string) {
  const x = parseInt(await redis.get(`${Constants.redis.cache.premium.LEVEL}:${id}`));

  if (x > 0) {
    const embedColor = await getEmbedColor(id);

    embedColorCache.set(id, embedColor);
    setTimeout(() => {
      embedColorCache.delete(id);
    }, ms("1 hour"));
  } else {
    embedColorCache.set(id, "none");
    setTimeout(() => {
      embedColorCache.delete(id);
    }, ms("1 hour"));
  }
}
