exports.Command = class {
    /**
     * @returns {Command} 
     * @param {String} name command name
     * @param {String} description command description
     * @param {String} category command category
     * @param {*} permissions command permissions
     * @param {*} aliases command aliases
     * @param {*} run command code
     */
    constructor(name, description, category, permissions, aliases, run) {
        this.name = name.toString()
        this.description = description.toString()
        if (Object.values(categories).indexOf(category) == -1) throw new Error("Invalid Category")
        this.category = category
        return this
    }

    /**
     * @returns {Command}
     * @param {Array<String>} permissions 
     */
    setPermissions(permissions) {
        this.permissions = permissions
        return this
    }

    /**
     * @returns {Command}
     * @param {Array<String>} aliases 
     */
    setAliases(aliases) {
        this.aliases = aliases
        return this
    }

    /**
     * @returns {Command}
     * @param {Function} run 
     */
    setRun(run) {
        this.run = run
        return this
    }
}

const categories = {
    NONE: "none",
    FUN: "fun",
    INFO: "info",
    MONEY: "money",
    MODERATION: "moderation",
    NSFW: "nsfw"
}

exports.categories = categories