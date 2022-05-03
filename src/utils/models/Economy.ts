export interface Item {
    id: string
    name: string
    emoji: string
    description: string
    worth?: number
    role?: string
    aliases?: Array<string>
    speed?: number
    boobies?: string
}

export interface EconomyProfile {
    id?: string
    money?: number
    bank?: number
    xp?: number
    prestige?: number
    padlock?: number
    dms?: number
    last_vote?: number
    inventory?: any
    workers?: any
}

export interface LotteryTicket {
    user_id: string
    id: number
}
