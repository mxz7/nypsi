function info(string, type) {
    let color
    
    if (!type) type = types.INFO

    switch (type) {
        case types.INFO:
            color = "\x1b[37m"
            break
        case types.GUILD:
            color = "\x1b[36m"
            break
        case types.ECONOMY:
            color = "\x1b[32m"
            break
        case types.DATA:
            color = "\x1b[32m"
            break
        case types.AUTOMATION:
            color = "\x1b[34m"
            break
        case types.COMMAND:
            color = "\x1b[33m"
            break
        case types.IMAGE:
            color = "\x1b[32m"
            break
    }

    const out = `${color}[${getTimestamp()}] [${type}] ${string} \x1b[0m`
    console.log(out)
}

exports.info = info

function error(string) {
    console.error(`\x1B[31m[${getTimestamp()}] ${string}\x1B[0m`)
}

exports.error = error

const types = {
    INFO: "info",
    DATA: "data",
    GUILD: "guild",
    ECONOMY: "eco",
    AUTOMATION: "auto",
    COMMAND: "command",
    IMAGE: "image"
}

exports.types = types

/**
 * @returns {String}
 */
function getTimestamp() {
    const date = new Date()
    let hours = date.getHours().toString()
    let minutes = date.getMinutes().toString()
    let seconds = date.getSeconds().toString()

    if (hours.length == 1) {
        hours = "0" + hours
    }

    if (minutes.length == 1) {
        minutes = "0" + minutes
    }

    if (seconds.length == 1) {
        seconds = "0" + seconds
    }

    const timestamp = hours + ":" + minutes + ":" + seconds

    return timestamp
}

exports.getTimestamp = getTimestamp