import { ColorResolvable, GuildMember, MessageEmbed } from "discord.js"
import { getEmbedColor, getTier, isPremium } from "../premium/utils"
import { getColor } from "../utils"

export class CustomEmbed extends MessageEmbed {
    /**
     * @returns {CustomEmbed}
     * @param {GuildMember} member
     * @param {Boolean} footer
     * @param {String} text
     */
    constructor(member: GuildMember, footer: boolean, text: string) {
        super()

        if (member) {
            if (isPremium(member.user.id)) {
                if (getTier(member.user.id) >= 1) {
                    const color = getEmbedColor(member.user.id)
                    if (color != "default") {
                        super.setColor(color)
                    } else {
                        super.setColor(getColor(member))
                    }
                } else {
                    super.setColor(getColor(member))
                }
            } else {
                super.setColor(getColor(member))
            }
        }

        if (text) {
            if (text.length > 2000) {
                text = text.substring(0, 2000)
            }

            super.setDescription(text)
        }

        if (footer) {
            super.setFooter({ text: "nypsi.xyz" })
        }

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setDescription(text: string) {
        if (text.length > 2000) {
            text = text.substr(0, 2000)
        }
        super.setDescription(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} title
     * @param {String} text
     * @param {Boolean} inline
     */
    addField(title: string, text: string, inline: boolean) {
        if (text.length > 1000) {
            text = text.substr(0, 1000)
        }

        super.addField(title, text, inline)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {string} text
     */
    setTitle(text: string) {
        super.setTitle(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setImage(url: string) {
        super.setImage(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setThumbnail(url: string) {
        super.setThumbnail(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setURL(url: string) {
        super.setURL(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setHeader(text: string) {
        super.setAuthor({ name: text })

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} color
     */
    setColor(color: `#${string}` | ColorResolvable) {
        super.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
    setTimestamp(date: Date | number) {
        if (date) {
            super.setTimestamp(date)
        } else {
            super.setTimestamp()
        }

        return this
    }
}

export class ErrorEmbed extends MessageEmbed {
    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    constructor(text: string) {
        super()
        super.setColor("#e31937")
        super.setTitle("`❌`")
        super.setDescription(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setDescription(text: string) {
        if (text.length > 2000) {
            text = text.substring(0, 2000)
        }
        super.setDescription(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} title
     * @param {String} text
     * @param {Boolean} inline
     */
    addField(title: string, text: string, inline: boolean) {
        if (text.length > 1000) {
            text = text.substring(0, 1000)
        }

        super.addField(title, text, inline)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {string} text
     */
    setTitle(text: string) {
        super.setTitle(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setImage(url: string) {
        super.setImage(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setThumbnail(url: string) {
        super.setThumbnail(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setURL(url: string) {
        super.setURL(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setHeader(text: string): ErrorEmbed {
        super.setAuthor({ name: text })

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} color
     */
    setColor(color: `#${string}` | ColorResolvable) {
        super.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
    setTimestamp(date: Date | number) {
        if (date) {
            super.setTimestamp(date)
        } else {
            super.setTimestamp()
        }

        return this
    }
}
