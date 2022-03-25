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

    upgrade() {
        this.level++
        this.perItem = this.perItem * 2
        this.maxStorage = Math.floor(this.maxStorage * 1.5)
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
            level: json.level,
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
            maxStorage: 600,
            perItem: 4,
            perInterval: 17,
            cost: 100000,
            prestige: 1,
            name: "potato farmer",
            id: 0,
            itemName: "🥔",
        })

        return this
    }
}

exports.PotatoFarmer = PotatoFarmer

workers.set(0, PotatoFarmer)

class Fisherman extends Worker {
    /**
     * @returns {Fisherman}
     */
    constructor() {
        super({
            maxStorage: 350,
            perItem: 15,
            perInterval: 10,
            cost: 250000,
            prestige: 2,
            name: "fisherman",
            id: 1,
            itemName: "🐟",
        })

        return this
    }
}

exports.Fisherman = Fisherman

workers.set(1, Fisherman)

class Miner extends Worker {
    /**
     * @returns {Miner}
     */
    constructor() {
        super({
            maxStorage: 400,
            perItem: 22,
            perInterval: 14,
            cost: 400000,
            prestige: 2,
            name: "miner",
            id: 2,
            itemName: "⛏",
        })

        return this
    }
}

exports.Miner = Miner

workers.set(2, Miner)

class LumberJack extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor() {
        super({
            maxStorage: 350,
            perItem: 35,
            perInterval: 10,
            cost: 500000,
            prestige: 3,
            name: "lumberjack",
            id: 3,
            itemName: "🪓",
        })

        return this
    }
}

exports.LumberJack = LumberJack

workers.set(3, LumberJack)

class Butcher extends Worker {
    /**
     * @returns {Butcher}
     */
    constructor() {
        super({
            maxStorage: 600,
            perItem: 17,
            perInterval: 25,
            cost: 600000,
            prestige: 4,
            name: "butcher",
            id: 4,
            itemName: "🥓",
        })

        return this
    }
}

exports.Butcher = Butcher

workers.set(4, Butcher)

class Tailor extends Worker {
    /**
     * @returns {Tailor}
     */
    constructor() {
        super({
            maxStorage: 750,
            perItem: 20,
            perInterval: 30,
            cost: 700000,
            prestige: 5,
            name: "tailor",
            id: 5,
            itemName: "👕",
        })

        return this
    }
}

exports.Tailor = Tailor

workers.set(5, Tailor)

class SpaceX extends Worker {
    /**
     * @returns {Tailor}
     */
    constructor() {
        super({
            maxStorage: 85,
            perItem: 50,
            perInterval: 1,
            cost: 1500000,
            prestige: 7,
            name: "spacex",
            id: 6,
            itemName: "🚀",
        })

        return this
    }
}

exports.SpaceX = SpaceX

workers.set(6, SpaceX)

/**
 *
 * @returns {Map<Number, Worker>}
 */
function getAllWorkers() {
    return workers
}

exports.getAllWorkers = getAllWorkers
