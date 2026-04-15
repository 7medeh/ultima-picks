export type StatBlock = {
  hp: number
  mp: number
  atk: number
  def: number
}

export type Actor = {
  id: string
  name: string
  desc?: string
  stats: StatBlock
  // optional transient modifiers (not persisted across resets)
  tempDef?: number
  // avatar urls: small pixel-art sprite and a higher-quality portrait
  avatars?: {
    pixel: string
    portrait: string
  }
}

export type GameState = {
  turn: number
  player: Actor
  enemy: Actor
  log: string[]
  running: boolean
  locationIndex?: number
  locations?: string[]
  // progression and inventory
  xp?: number
  level?: number
  inventory?: Item[]
}

export type Item = {
  id: string
  name: string
  type: 'consumable' | 'equipment' | 'key' | 'misc'
  desc?: string
  effect?: {
    heal?: number
    mp?: number
    atk?: number
    def?: number
  }
}
