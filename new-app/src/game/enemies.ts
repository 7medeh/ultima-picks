import type { Actor } from './types'

// Use DiceBear to generate pixel and portrait avatars. These endpoints return SVG/PNG images.
function pixelAvatar(seed: string) {
  return `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(seed)}`
}

function portraitAvatar(seed: string) {
  // use adventurer or identicon style for a higher-quality portrait PNG
  return `https://api.dicebear.com/6.x/adventurer/png?seed=${encodeURIComponent(seed)}&size=240`
}

const enemyNames = [
  'Stray Thug',
  'Rusty Brawler',
  'Neighborhood Dog',
  'Angry Motorist',
  'Lawn Gnome',
  'Shopkeeper Guard',
  'Taxi Hustler',
  'Fountain Sprayer'
]

export function generateEnemy(seedBase: string, difficulty = 1): Actor {
  const seed = `${seedBase}-${Date.now() % 100000}-${Math.floor(Math.random() * 10000)}`
  const name = enemyNames[Math.abs(hash(seed)) % enemyNames.length]
  const hp = Math.max(6, Math.floor(10 + difficulty * 6 + (hash(seed) % 10)))
  const atk = Math.max(2, Math.floor(3 + difficulty * 2 + (hash(seed + 'a') % 4)))
  const def = Math.max(0, Math.floor(1 + difficulty * 1 + (hash(seed + 'd') % 3)))

  return {
    id: `enemy-${seed}`,
    name: `${name}`,
    desc: `A ${name.toLowerCase()} you run into in Dearborn.`,
    stats: { hp, mp: 0, atk, def },
    avatars: { pixel: pixelAvatar(seed), portrait: portraitAvatar(seed) }
  }
}

function hash(s: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return h >>> 0
}
