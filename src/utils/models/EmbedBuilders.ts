import { ColorResolvable, GuildMember, MessageEmbed } from "discord.js";
import redis from "../database/redis";
import { getColor } from "../functions/color";
import { getEmbedColor } from "../premium/utils";

const embedColorCache: Map<string, string> = new Map();

export class CustomEmbed extends MessageEmbed {
    /**
     * @returns {CustomEmbed}
     * @param {GuildMember} member
     * @param {Boolean} footer
     * @param {String} text
     */
    constructor(member?: GuildMember, footer?: boolean, text?: string) {
        super();

        if (member) {
            checkPremium(member.user.id);
            const color = embedColorCache.get(member.user.id) as ColorResolvable | "default" | "none";

            if (color && color != "none") {
                if (color == "default") {
                    super.setColor(getColor(member));
                } else {
                    super.setColor(color);
                }
            } else {
                super.setColor(getColor(member));
            }
        }

        if (text) {
            if (text.length > 2000) {
                text = text.substring(0, 2000);
            }

            super.setDescription(text);
        }

        const chance = Math.floor(Math.random() * 30);

        if (chance == 7) super.setFooter("nypsi.xyz");

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setDescription(text: string) {
        if (text.length > 2000) {
            text = text.substr(0, 2000);
        }
        super.setDescription(text);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} title
     * @param {String} text
     * @param {Boolean} inline
     */
    addField(title: string, text: string, inline?: boolean) {
        if (text.length > 1000) {
            text = text.substr(0, 1000);
        }

        super.addField(title, text, inline);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {string} text
     */
    setTitle(text: string) {
        super.setTitle(text);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setImage(url: string) {
        super.setImage(url);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setThumbnail(url: string) {
        super.setThumbnail(url);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setURL(url: string) {
        super.setURL(url);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setHeader(text: string, image?: string) {
        super.setAuthor({ name: text, iconURL: image });

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} color
     */
    setColor(color: `#${string}` | ColorResolvable) {
        super.setColor(color);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
    setTimestamp(date?: Date | number) {
        if (date) {
            super.setTimestamp(date);
        } else {
            super.setTimestamp();
        }

        return this;
    }
}

export class ErrorEmbed extends MessageEmbed {
    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    constructor(text: string) {
        super();
        super.setColor("#e31937");
        super.setTitle("`❌`");
        super.setDescription(text);

        return this;
    }

    removeTitle() {
        delete this.title;

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setDescription(text: string) {
        if (text.length > 2000) {
            text = text.substring(0, 2000);
        }
        super.setDescription(text);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} title
     * @param {String} text
     * @param {Boolean} inline
     */
    addField(title: string, text: string, inline?: boolean) {
        if (text.length > 1000) {
            text = text.substring(0, 1000);
        }

        super.addField(title, text, inline);

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {string} text
     */
    setTitle(text: string) {
        super.setTitle(text);

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setImage(url: string) {
        super.setImage(url);

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setThumbnail(url: string) {
        super.setThumbnail(url);

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setURL(url: string) {
        super.setURL(url);

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setHeader(text: string): ErrorEmbed {
        super.setAuthor({ name: text });

        return this;
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} color
     */
    setColor(color: `#${string}` | ColorResolvable) {
        super.setColor(color);

        return this;
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
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
    const x = parseInt(await redis.get(`cache:premium:level:${id}`));

    if (x > 0) {
        const embedColor = await getEmbedColor(id);

        embedColorCache.set(id, embedColor);
        setTimeout(() => {
            embedColorCache.delete(id);
        }, 300 * 1000);
    } else {
        embedColorCache.set(id, "none");
        setTimeout(() => {
            embedColorCache.delete(id);
        }, 300 * 1000);
    }
}
