const workers = new Map()

interface Settings {
    maxStorage: number
    perItem: number
    perInterval: number
    cost: number
    prestige: number
    name: string
    itemName: string
    level?: number
    stored?: number
    id: number
}

export class Worker {
    public maxStorage: number
    public perItem: number
    public perInterval: number
    public cost: number
    public prestige: number
    public name: string
    public id: number
    public itemName: string
    public level: number
    public stored: number
    /**
     * @returns {Worker}
     * @param {JSON} settings
     */
    constructor(settings: Settings) {
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
    getUpgradeCost(): number {
        const base = this.cost
        const currentLevel = this.level

        return base + base * currentLevel
    }

    /**
     *
     * @returns {Number}
     */
    getHourlyRate(): number {
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
    static fromJSON(json: Worker): Worker {
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

export class PotatoFarmer extends Worker {
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

workers.set(0, PotatoFarmer)

export class Fisherman extends Worker {
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

workers.set(1, Fisherman)

export class Miner extends Worker {
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

workers.set(2, Miner)

export class LumberJack extends Worker {
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

workers.set(3, LumberJack)

export class Butcher extends Worker {
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

workers.set(4, Butcher)

export class Tailor extends Worker {
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

workers.set(5, Tailor)

export class SpaceX extends Worker {
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

workers.set(6, SpaceX)

export type Constructor<T> = new (...args: any[]) => T

/**
 *
 * @returns {Map<Number, Worker>}
 */
export function getAllWorkers(): Map<number, Constructor<Worker>> {
    return workers
}
