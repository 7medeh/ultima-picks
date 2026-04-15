import React, { useCallback, useEffect, useState } from 'react'
import type { GameState, Item } from './types'
import { createInitialState, performPlayerAttack, performEnemyTurn, performPlayerGuard, performPlayerSpecial, tryLevelUp, useItemOnPlayer } from './engine'
import { saveGame, loadGame } from './storage'
import { generateEnemy } from './enemies'
import { LOCATIONS, nextLocationIndex } from './world'
import TileMap from './TileMap'
import { locationAt, coordsForLocation, type Coord } from './map'
import { questsAtLocation, QUESTS } from './quests'
import { npcsAtLocation } from './npcs'
import { equipItem } from './equipment'
import { Howl } from 'howler'

export default function Game(): JSX.Element {
  const [state, setState] = useState<GameState>(() => createInitialState('Moe'))
  const [busy, setBusy] = useState(false)
  const [encounterEnemy, setEncounterEnemy] = useState<null | any>(null)
  const [activeQuests, setActiveQuests] = useState<string[]>([])

  // Save/load/reset
  const save = useCallback(() => {
    saveGame(state)
    const s = structuredClone(state)
    s.log.push('Game saved.')
    setState(s)
  }, [state])

  const load = useCallback(() => {
    const loaded = loadGame()
    if (loaded) setState(loaded)
  }, [])

  const reset = useCallback(() => {
    setState(createInitialState(state.player?.name || 'Moe'))
    setActiveQuests([])
  }, [state.player])

  // Item use
  const useItem = useCallback((itemId: string) => {
    const s = structuredClone(state)
    useItemOnPlayer(s, itemId)
    tryLevelUp(s)
    setState(s)
  }, [state])

  // Combat handlers
  const attack = useCallback(async () => {
    if (!state.running || busy) return
    setBusy(true)
    const s1 = await performPlayerAttack(structuredClone(state))
    setState({ ...s1 })
    if (s1.running) {
      await new Promise((r) => setTimeout(r, 350))
      const s2 = await performEnemyTurn(structuredClone(s1))
      if (s2.enemy?.tempDef) s2.enemy.tempDef = 0
      if (s2.player?.tempDef) s2.player.tempDef = 0
      setState({ ...s2 })
    } else {
      setEncounterEnemy(null)
    }
    setBusy(false)
  }, [state, busy])

  const guard = useCallback(async () => {
    if (!state.running || busy) return
    setBusy(true)
    const s1 = await performPlayerGuard(structuredClone(state))
    setState({ ...s1 })
    if (s1.running) {
      await new Promise((r) => setTimeout(r, 350))
      const s2 = await performEnemyTurn(structuredClone(s1))
      if (s2.enemy?.tempDef) s2.enemy.tempDef = 0
      if (s2.player?.tempDef) s2.player.tempDef = 0
      setState({ ...s2 })
    }
    setBusy(false)
  }, [state, busy])

  const special = useCallback(async () => {
    if (!state.running || busy) return
    setBusy(true)
    const s1 = await performPlayerSpecial(structuredClone(state))
    setState({ ...s1 })
    if (s1.running) {
      await new Promise((r) => setTimeout(r, 350))
      const s2 = await performEnemyTurn(structuredClone(s1))
      setState({ ...s2 })
    } else {
      setEncounterEnemy(null)
    }
    setBusy(false)
  }, [state, busy])

  // Travel & encounters
  const travel = useCallback(() => {
    if (busy) return
    const next = nextLocationIndex(state.locationIndex || 0)
    const s = structuredClone(state)
    s.locationIndex = next
    const locName = LOCATIONS[next] ?? `Location ${next}`
    s.log.push(`${s.player.name} travels to ${locName}.`)
    if (Math.random() < 0.45) {
      const e = generateEnemy(`${locName}-${Date.now()}`, Math.max(1, Math.floor((s.turn || 1) / 3)))
      setEncounterEnemy(e)
      s.log.push(`An enemy lurks nearby: ${e.name}.`)
    } else {
      setEncounterEnemy(null)
    }
    setState(s)
  }, [state, busy])

  // Map movement (from TileMap)
  const onMapMove = useCallback((pos: Coord) => {
    const loc = locationAt(pos)
    if (loc && typeof loc.index === 'number') {
      const s = structuredClone(state)
      s.locationIndex = loc.index
      s.log.push(`${s.player.name} arrives at ${LOCATIONS[loc.index]}.`)
      for (const q of questsAtLocation(loc.index).filter((q) => activeQuests.includes(q.id) && !q.completed)) {
        s.xp = (s.xp || 0) + q.rewardXP
        s.log.push(`Quest complete: ${q.title} (+${q.rewardXP} XP).`)
        if (q.rewardItemId) {
          s.inventory = [...(s.inventory || []), { id: q.rewardItemId, name: q.rewardItemId.replace(/-/g, ' '), type: 'consumable' } as Item]
          s.log.push(`You received ${q.rewardItemId}.`)
        }
        q.completed = true
      }
      setState({ ...s })
    }
  }, [state, activeQuests])

  // Engage an encountered enemy
  const engage = useCallback(async () => {
    if (!encounterEnemy || busy) return
    setBusy(true)
    const s = structuredClone(state)
    s.enemy = encounterEnemy
    setState({ ...s })
    const s1 = await performPlayerAttack(structuredClone(s))
    setState({ ...s1 })
    if (s1.running) {
      await new Promise((r) => setTimeout(r, 350))
      const s2 = await performEnemyTurn(structuredClone(s1))
      setState({ ...s2 })
    }
    if (!s1.running || (s1.enemy && s1.enemy.stats.hp <= 0)) setEncounterEnemy(null)
    setBusy(false)
  }, [encounterEnemy, state, busy])

  useEffect(() => {
    const el = document.getElementById('log')
    if (el) el.scrollTop = el.scrollHeight
  }, [state.log.length])

  useEffect(() => {
    try {
      const music = new Howl({ src: ['/assets/music-loop.mp3'], loop: true, volume: 0.25 })
      music.play()
      return () => music.unload()
    } catch (err) {
      // ignore
    }
  }, [])

  return (
    <section>
      <div className="game-wrapper">
        <aside className="sidebar">
          <h3>{state.player.name} (Lvl {state.level || 1})</h3>
          <p>HP: {Math.max(0, state.player.stats.hp)} | MP: {Math.max(0, state.player.stats.mp)}</p>
          <p>ATK: {state.player.stats.atk} DEF: {state.player.stats.def}</p>
          <p className="xp-legend">XP: {state.xp || 0} / {(state.level || 1) * 100}</p>
          <div className="xp-bar" style={{ marginBottom: 6 }}>
            <div className="xp-fill" style={{ width: `${Math.min(100, ((state.xp || 0) / ((state.level || 1) * 100)) * 100)}%` }} />
          </div>

          <h4>Inventory</h4>
          {state.inventory && state.inventory.length ? (
            <ul className="inventory-list">
              {state.inventory.map((it) => (
                <li key={it.id}>
                  <div>
                    <strong>{it.name}</strong>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>{it.desc}</div>
                  </div>
                  <div>
                    {it.type === 'consumable' && (<button className="btn muted" onClick={() => useItem(it.id)} style={{ marginLeft: 8 }}>Use</button>)}
                    {it.type === 'equipment' && (<button className="btn" onClick={() => { const s = structuredClone(state); equipItem(s, it.id); setState({ ...s }) }} style={{ marginLeft: 8 }}>Equip</button>)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>(empty)</p>
          )}

          <div style={{ height: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={save}>Save</button>
            <button className="btn muted" onClick={load}>Load</button>
            <button className="btn muted" onClick={reset}>Reset</button>
          </div>

          <div style={{ height: 12 }} />
          <h4>NPCs here</h4>
          {npcsAtLocation(state.locationIndex || 0).map((n) => (
            <div key={n.id} style={{ marginBottom: 6 }}>
              <strong>{n.name}</strong>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{n.desc}</div>
              {n.questGiven && (<button className="btn" onClick={() => { setActiveQuests((q) => Array.from(new Set([...q, n.questGiven!]))) }}>Accept Quest</button>)}
            </div>
          ))}

          <div style={{ height: 8 }} />
          <h4>Quests</h4>
          {questsAtLocation(state.locationIndex || 0).map((q) => (
            <div key={q.id} style={{ marginBottom: 6 }}>
              <strong>{q.title}</strong>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{q.desc}</div>
              <button className="btn" onClick={() => { setActiveQuests((a) => Array.from(new Set([...a, q.id]))); state.log.push(`Quest accepted: ${q.title}`); setState({ ...state }) }}>Accept</button>
            </div>
          ))}
        </aside>

        <main className="main-area">
          <div className="map-card">
            <TileMap playerPos={coordsForLocation(state.locationIndex || 0) || { x: 3, y: 1 }} onMove={onMapMove} />
          </div>

          <div className="panel-row">
            <div style={{ flex: 1 }}>
              <div className="controls">
                <button className="btn" onClick={attack} disabled={!state.running || busy}>Attack</button>
                <button className="btn" onClick={guard} disabled={!state.running || busy}>Guard</button>
                <button className="btn" onClick={special} disabled={!state.running || busy}>Special</button>
                <button className="btn muted" onClick={travel} disabled={busy}>Travel</button>
                <button className="btn muted" onClick={engage} disabled={!encounterEnemy || busy}>Engage</button>
              </div>

              <div className="log-panel" id="log">
                {state.log.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </div>

            <aside className="enemy-panel">
              <h4>Enemy</h4>
              {state.enemy ? (
                <div>
                  {state.enemy.avatars?.pixel && (<img className="pixel-sprite" src={state.enemy.avatars.pixel} alt="enemy" />)}
                  <strong>{state.enemy.name}</strong>
                  <div style={{ fontSize: 12 }}>{state.enemy.desc}</div>
                  <p>HP: {Math.max(0, state.enemy.stats.hp)}</p>
                  <p>ATK: {state.enemy.stats.atk} DEF: {state.enemy.stats.def}</p>
                </div>
              ) : (
                <p>No enemy engaged</p>
              )}
            </aside>
          </div>
        </main>
      </div>
    </section>
  )
}

