import type { Item } from './types'

const baseItems: Item[] = [
  { id: 'potion-small', name: 'Small Potion', type: 'consumable', desc: 'Heals 10 HP', effect: { heal: 10 } },
  { id: 'potion-medium', name: 'Medium Potion', type: 'consumable', desc: 'Heals 20 HP', effect: { heal: 20 } },
  { id: 'ether-small', name: 'Small Ether', type: 'consumable', desc: 'Restores 5 MP', effect: { mp: 5 } },
  { id: 'knife', name: 'Rusty Knife', type: 'equipment', desc: 'ATK +1', effect: { atk: 1 } },
  { id: 'shield', name: 'Tin Shield', type: 'equipment', desc: 'DEF +1', effect: { def: 1 } }
]

function hash(s: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return h >>> 0
}

export function generateLoot(seedBase: string, difficulty = 1) {
  const seed = `${seedBase}-${Date.now() % 100000}-${Math.floor(Math.random() * 10000)}`
  const roll = hash(seed) % 100
  const loot = [] as Item[]
  if (roll < 50) {
    loot.push(baseItems[0])
  } else if (roll < 75) {
    loot.push(baseItems[1])
  } else if (roll < 85) {
    loot.push(baseItems[2])
  } else if (roll < 95) {
    loot.push(baseItems[3])
  } else {
    loot.push(baseItems[4])
  }

  // small chance for second item
  if ((hash(seed + 'x') % 100) < (10 + difficulty * 2)) {
    loot.push(baseItems[0])
  }

  return loot
}
