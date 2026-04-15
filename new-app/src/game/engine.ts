import type { Actor, GameState } from './types'
import { generateStorySnippet } from './story'
import { generateLoot } from './items'
import type { Item } from './types'

function makeActor(name: string, hp = 30, atk = 6, def = 2) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    stats: { hp, mp: 10, atk, def }
  } as Actor
}

export function createInitialState(playerName = "Moe") {
  const player = makeActor(playerName, 40, 8, 3)
  const enemy = makeActor('Stray Thug', 30, 6, 1)

  const state: GameState = {
    turn: 1,
    player,
    enemy,
    log: [`A scrappy fight begins in Dearborn, MI.`],
    running: true,
    xp: 0,
    level: 1,
    inventory: []
  }

  return state
}

export async function performPlayerAttack(state: GameState) {
  if (!state.running) return state
  const enemyDef = (state.enemy.stats.def || 0) + (state.enemy.tempDef || 0)
  const damage = Math.max(1, state.player.stats.atk - enemyDef)
  state.enemy.stats.hp -= damage
  const event = `${state.player.name} attacks ${state.enemy.name} for ${damage} damage.`
  const snippet = await generateStorySnippet({ playerName: state.player.name, enemyName: state.enemy.name, turn: state.turn, event })
  state.log.push(event)
  state.log.push(snippet)
  state.turn += 1

  if (state.enemy.stats.hp <= 0) {
    state.log.push(`${state.enemy.name} falls. ${state.player.name} stands victorious.`)
    // award XP and loot
    const xpGain = Math.max(5, Math.floor(state.enemy.stats.atk * 2 + state.enemy.stats.def)) + 5
    state.xp = (state.xp || 0) + xpGain
    state.log.push(`${state.player.name} gains ${xpGain} XP.`)
    const loot = generateLoot(state.enemy.name + '-' + state.turn, Math.max(1, Math.floor(state.turn / 3)))
    if (loot && loot.length) {
      state.inventory = [...(state.inventory || []), ...loot as Item[]]
      state.log.push(`${state.player.name} finds: ${loot.map((l) => l.name).join(', ')}.`)
    }
    state.running = false
  }

  return state
}

export async function performEnemyTurn(state: GameState) {
  if (!state.running) return state
  const playerDef = (state.player.stats.def || 0) + (state.player.tempDef || 0)
  const damage = Math.max(1, state.enemy.stats.atk - playerDef)
  state.player.stats.hp -= damage
  const event = `${state.enemy.name} strikes back for ${damage} damage.`
  const snippet = await generateStorySnippet({ playerName: state.player.name, enemyName: state.enemy.name, turn: state.turn, event })
  state.log.push(event)
  state.log.push(snippet)
  state.turn += 1

  if (state.player.stats.hp <= 0) {
    state.log.push(`${state.player.name} collapses. The tale ends here — for now.`)
    state.running = false
  }

  return state
}

export function tryLevelUp(state: GameState) {
  const xp = state.xp || 0
  const lvl = state.level || 1
  const threshold = 100 * lvl
  if (xp >= threshold) {
    state.level = lvl + 1
    state.xp = xp - threshold
    // give stat increases
    state.player.stats.hp += 10
    state.player.stats.atk += 2
    state.player.stats.def += 1
    state.player.stats.mp += 5
    state.log.push(`${state.player.name} reaches level ${state.level}!`)
  }
}

export function useItemOnPlayer(state: GameState, itemId: string) {
  const inv = state.inventory || []
  const idx = inv.findIndex((i) => i.id === itemId)
  if (idx === -1) {
    state.log.push(`No such item to use: ${itemId}`)
    return state
  }
  const item = inv[idx]
  if (item.type === 'consumable' && item.effect) {
    if (item.effect.heal) state.player.stats.hp += item.effect.heal
    if (item.effect.mp) state.player.stats.mp += item.effect.mp
    state.log.push(`${state.player.name} uses ${item.name}.`)
    // remove used item
    state.inventory = [...inv.slice(0, idx), ...inv.slice(idx + 1)]
  } else {
    state.log.push(`${item.name} can't be used right now.`)
  }
  return state
}

export async function performPlayerGuard(state: GameState) {
  if (!state.running) return state
  // give a small temporary defensive bonus that lasts until after enemy turn
  state.player.tempDef = (state.player.tempDef || 0) + 3
  const event = `${state.player.name} braces and guards, increasing defense.`
  const snippet = await generateStorySnippet({ playerName: state.player.name, enemyName: state.enemy.name, turn: state.turn, event })
  state.log.push(event)
  state.log.push(snippet)
  state.turn += 1
  return state
}

export async function performPlayerSpecial(state: GameState) {
  if (!state.running) return state
  if (state.player.stats.mp < 4) {
    state.log.push(`${state.player.name} tries to use a special move but lacks energy.`)
    return state
  }
  state.player.stats.mp -= 4
  const bonus = 6
  const enemyDef = (state.enemy.stats.def || 0) + (state.enemy.tempDef || 0)
  const damage = Math.max(1, state.player.stats.atk + bonus - enemyDef)
  state.enemy.stats.hp -= damage
  const event = `${state.player.name} performs a special strike for ${damage} damage (MP -4).`
  const snippet = await generateStorySnippet({ playerName: state.player.name, enemyName: state.enemy.name, turn: state.turn, event })
  state.log.push(event)
  state.log.push(snippet)
  state.turn += 1

  if (state.enemy.stats.hp <= 0) {
    state.log.push(`${state.enemy.name} falls. ${state.player.name} stands victorious.`)
    state.running = false
  }

  return state
}
