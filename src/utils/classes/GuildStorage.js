class Countdown {
    /**
     * @returns {Countdown}
     * @param {Date} date
     * @param {String} format
     * @param {String} finalFormat
     * @param {String} channel
     * @param {String} id
     */
    constructor(date, format, finalFormat, channel, id) {
        this.date = date
        this.format = format
        this.finalFormat = finalFormat
        this.channel = channel
        this.id = id

        return this
    }
}

exports.Countdown = Countdown
