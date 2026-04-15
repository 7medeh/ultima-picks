import type { GameState } from './types'

export function equipItem(state: GameState, itemId: string) {
  const inv = state.inventory || []
  const idx = inv.findIndex((i) => i.id === itemId)
  if (idx === -1) return state
  const it = inv[idx]
  if (it.type !== 'equipment' || !it.effect) return state
  // apply stat bonuses permanently
  if (it.effect.atk) state.player.stats.atk += it.effect.atk
  if (it.effect.def) state.player.stats.def += it.effect.def
  state.log.push(`${state.player.name} equips ${it.name}.`)
  // remove from inventory (simple model)
  state.inventory = [...inv.slice(0, idx), ...inv.slice(idx + 1)]
  return state
}
