import { ColorResolvable, EmbedBuilder, GuildMember } from "discord.js";
import Constants from "../utils/Constants";
import { getEmbedColor } from "../utils/functions/premium/color";
import { logger } from "../utils/logger";
import ms = require("ms");

const colorCache = new Map<string, string>();

setInterval(() => {
  let count = 0;
  for (const [key, color] of colorCache.entries()) {
    if (color === "default") {
      count++;
      colorCache.delete(key);
    }
  }

  logger.debug(`removed ${count} from color cache. size: ${colorCache.size}`);
}, ms("1 hour"));

export class CustomEmbed extends EmbedBuilder {
  constructor(member?: GuildMember | string, text?: string, disableFooter = false) {
    super();

    super.setColor(Constants.PURPLE);

    if (member) {
      super.setColor(getColor(typeof member === "string" ? member : member.id));
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
      text = text.substring(0, 2000);
    }
    super.setDescription(text);

    return this;
  }

  addField(title: string, text: string, inline = false) {
    if (text.length > 1000) {
      text = text.substring(0, 1000);
    }

    if (this.data?.fields) {
      this.data.fields.push({ name: title, value: text, inline: inline });
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

  setHeader(text: string, image?: string, url?: string) {
    super.setAuthor({ name: text, iconURL: image, url });

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
      text = text.substring(0, 1000);
    }

    if (this.data?.fields) {
      this.data.fields.push({ name: title, value: text, inline: inline });
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

export function getColor(id: string): ColorResolvable {
  (async () => {
    const color = await getEmbedColor(id);

    colorCache.set(id, color);
  })();
  if (colorCache.has(id)) {
    if (colorCache.get(id) === "default") return Constants.PURPLE;
    else return colorCache.get(id) as ColorResolvable;
  } else return Constants.PURPLE;
}
