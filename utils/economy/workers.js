const workers = new Map()

class Worker {
    /**
     * @returns {Worker}
     * @param {JSON} settings
     */
    constructor(settings) {
        this.maxStorage = settings.maxStorage
        this.perItem = settings.perItem
        this.perInterval = settings.perInterval
        this.cost = settings.cost
        this.prestige = settings.prestige
        this.name = settings.name
        this.id = settings.id
        this.itemName = settings.itemName
        this.level = settings.level
        this.stored = settings.stored

        if (!this.level) {
            this.level = 1
        }

        if (!this.stored) {
            this.stored = 0
        }

        return this
    }

    /**
     * @returns {Number}
     */
    getUpgradeCost() {
        const base = this.cost
        const currentLevel = this.level

        return base + base * currentLevel
    }

    /**
     *
     * @returns {Number}
     */
    getHourlyRate() {
        return this.perInterval * 12
    }

    /**
     * @returns {Worker}
     * @param {Worker} json
     */
    static fromJSON(json) {
        const a = new Worker({
            maxStorage: json.maxStorage,
            perItem: json.perItem,
            perInterval: json.perInterval,
            cost: json.cost,
            prestige: json.prestige,
            name: json.name,
            id: json.id,
            itemName: json.itemName,
            stored: json.stored,
            level: json.level
        })

        return a
    }
}

exports.Worker = Worker

class PotatoFarmer extends Worker {
    /**
     * @returns {PotatoFarmer}
     */
    constructor() {
        super({
            maxStorage: 50000,
            perItem: 1,
            perInterval: 10,
            cost: 250000,
            prestige: 1,
            name: "potato farmer",
            id: 0,
            itemName: "🥔",
        })

        return this
    }
}

exports.PotatoFarmer = PotatoFarmer

workers.set(0, new PotatoFarmer())

/**
 * 
 * @returns {Map<Number, Worker>}
 */
function getAllWorkers() {
    return workers
}

exports.getAllWorkers = getAllWorkers