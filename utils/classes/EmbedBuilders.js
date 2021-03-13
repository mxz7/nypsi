const { MessageEmbed, GuildMember } = require("discord.js")
const { isPremium, getTier, getEmbedColor } = require("../../premium/utils")
const { getColor } = require("../utils")

class CustomEmbed {
    /**
     * @returns {CustomEmbed}
     * @param {GuildMember} member
     * @param {Boolean} footer
     * @param {String} text 
     */
    constructor(member, footer, text) {
        this.embed = new MessageEmbed()

        if (member) {

            if (isPremium(member.user.id)) {
                if (getTier(member.user.id) >= 2) {
                    if (getEmbedColor(member.user.id) != "default") {
                        this.embed.setColor(getEmbedColor(member.user.id))
                    } else {
                        this.embed.setColor(getColor(member))
                    }
                } else {
                    this.embed.setColor(getColor(member))
                }
            } else {
                this.embed.setColor(getColor(member))
            }
        }

        if (text) {
            if (text.length > 2000) {
                text = text.substr(0, 2000)
            }
    
            this.embed.setDescription(text)
        }

        if (footer) {
            this.embed.setFooter("nypsi.xyz")
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
        this.embed.setDescription(text)

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

        this.embed.addField(title, text, inline)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Sting} text 
     */
    setTitle(text) {
        this.embed.setTitle(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url 
     */
    setImage(url) {
        this.embed.setImage(url)


        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url
     */
    setThumbnail(url) {
        this.embed.setThumbnail(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} url 
     */
    setURL(url) {
        this.embed.setURL(url)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} text 
     */
    setHeader(text) {
        this.embed.setAuthor(text)

        return this
    }
    
    /**
     * @returns {CustomEmbed}
     * @param {String} text 
     */
    setFooter(text) {
        this.embed.setFooter(text)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {String} color 
     */
    setColor(color) {
        this.embed.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date 
     */
    setTimestamp(date) {
        if (date) {
            this.embed.setTimestamp(date)
        } else {
            this.embed.setTimestamp()
        }

        return this
    }
}

exports.CustomEmbed = CustomEmbed

class ErrorEmbed {
    /**
     * @returns {ErrorEmbed}
     * @param {String} text 
     */
    constructor(text) {
        this.embed = new MessageEmbed().setColor("#e31937")
        this.embed.setTitle("`❌`")
        this.embed.setDescription(text)

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
        this.embed.setDescription(text)

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

        this.embed.addField(title, text, inline)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {Sting} text 
     */
    setTitle(text) {
        this.embed.setTitle(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url 
     */
    setImage(url) {
        this.embed.setImage(url)


        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url
     */
    setThumbnail(url) {
        this.embed.setThumbnail(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} url 
     */
    setURL(url) {
        this.embed.setURL(url)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} text 
     */
    setHeader(text) {
        this.embed.setAuthor(text)

        return this
    }
    
    /**
     * @returns {ErrorEmbed}
     * @param {String} text 
     */
    setFooter(text) {
        this.embed.setFooter(text)

        return this
    }

    /**
     * @returns {ErrorEmbed}
     * @param {String} color 
     */
    setColor(color) {
        this.embed.setColor(color)

        return this
    }

    /**
     * @returns {CustomEmbed}
     * @param {Date} date 
     */
    setTimestamp(date) {
        if (date) {
            this.embed.setTimestamp(date)
        } else {
            this.embed.setTimestamp()
        }

        return this
    }
}

exports.ErrorEmbed = ErrorEmbed