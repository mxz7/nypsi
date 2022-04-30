const { MessageEmbed, GuildMember } = require("discord.js")
const { isPremium, getTier, getEmbedColor } = require("../premium/utils")
const { getColor } = require("../utils")

class CustomEmbed extends MessageEmbed {
    /**
     * @returns {CustomEmbed}
     * @param {GuildMember} member
     * @param {Boolean} footer
     * @param {String} text
     */
    constructor(member, footer, text) {
        super()

        if (member) {
            if (isPremium(member.user.id)) {
                if (getTier(member.user.id) >= 1) {
                    if (getEmbedColor(member.user.id) != "default") {
                        super.setColor(getEmbedColor(member.user.id))
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
                text = text.substr(0, 2000)
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
    setDescription(text) {
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
    addField(title, text, inline) {
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
    setTitle(text) {
        super.setTitle(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setImage(url) {
        super.setImage(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setThumbnail(url) {
        super.setThumbnail(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setURL(url) {
        super.setURL(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setHeader(text) {
        super.setAuthor({ name: text })

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text
     */
    setFooter(text) {
        super.setFooter({ text: text })

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} color
     */
    setColor(color) {
        super.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
    setTimestamp(date) {
        if (date) {
            super.setTimestamp(date)
        } else {
            super.setTimestamp()
        }

        return this
    }
}

exports.CustomEmbed = CustomEmbed

class ErrorEmbed extends MessageEmbed {
    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    constructor(text) {
        super().setColor("#e31937")
        super.setTitle("`❌`")
        super.setDescription(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setDescription(text) {
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
    addField(title, text, inline) {
        if (text.length > 1000) {
            text = text.substr(0, 1000)
        }

        super.addField(title, text, inline)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {string} text
     */
    setTitle(text) {
        super.setTitle(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setImage(url) {
        super.setImage(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setThumbnail(url) {
        super.setThumbnail(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setURL(url) {
        super.setURL(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setHeader(text) {
        super.setAuthor({ name: text })

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text
     */
    setFooter(text) {
        super.setFooter({ text: text })

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} color
     */
    setColor(color) {
        super.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date
     */
    setTimestamp(date) {
        if (date) {
            super.setTimestamp(date)
        } else {
            super.setTimestamp()
        }

        return this
    }
}

exports.ErrorEmbed = ErrorEmbed
