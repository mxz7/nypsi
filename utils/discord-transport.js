const Transport = require("winston-transport")
const { Webhook } = require("discord-webhook-node")

module.exports = class DiscordTransport extends Transport {
    constructor(opts) {
        super(opts)

        if (!opts.webhook) {
            throw new Error("No webhook given for Discord Transport")
        }

        this.queue = []
        this.hook = new Webhook(opts.webhook)

        setInterval(() => {
            let content = this.queue.join("\n")

            if (content.length > 1900) {
                content = content.substring(0, 1900) + "\n..."
            }

            if (content != "") {
                this.hook.send(content)
            }

            this.queue = []
        }, opts.interval || 2500)
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info)
        })

        this.queue.push(`\`\`\`ansi\n${info[Symbol.for("message")]}\n\`\`\``)

        callback()
    }
}