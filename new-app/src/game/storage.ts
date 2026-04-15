import type { GameState } from './types'

const KEY = 'moe-rpg-save'

export function saveGame(state: GameState) {
  try {
    const copy = structuredClone(state)
    localStorage.setItem(KEY, JSON.stringify(copy))
    return true
  } catch (err) {
    return false
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as GameState
  } catch (err) {
    return null
  }
}
