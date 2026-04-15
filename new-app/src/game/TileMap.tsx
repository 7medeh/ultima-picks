import React, { useEffect, useRef, useState } from 'react'
import type { Coord } from './map'
import { MAP_WIDTH, MAP_HEIGHT, locationAt, clampCoord, START_POS } from './map'

export type TileMapProps = {
  playerPos?: Coord
  onMove?: (pos: Coord) => void
}

export default function TileMap({ playerPos = START_POS, onMove }: TileMapProps) {
  const [internalPos, setInternalPos] = useState(playerPos)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // If parent controls playerPos, reflect it locally
  useEffect(() => {
    setInternalPos(playerPos)
  }, [playerPos])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] } as any
      const d = (dir as any)[e.key]
      if (d) {
        e.preventDefault()
        const next = clampCoord({ x: internalPos.x + d[0], y: internalPos.y + d[1] })
        setInternalPos(next)
        onMove && onMove(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [internalPos, onMove])

  function handleClick(x: number, y: number) {
    const next = clampCoord({ x, y })
    setInternalPos(next)
    onMove && onMove(next)
  }

  const tiles = [] as JSX.Element[]
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const idx = y * MAP_WIDTH + x
      const loc = locationAt({ x, y })
  const isPlayer = internalPos.x === x && internalPos.y === y
      tiles.push(
        <div
          key={idx}
          onClick={() => handleClick(x, y)}
          style={{
            width: 48, height: 48, border: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: loc.name ? 'rgba(96,165,250,0.06)' : 'rgba(255,255,255,0.01)', cursor: 'pointer'
          }}
        >
          {isPlayer ? <img src={`https://api.dicebear.com/6.x/pixel-art/svg?seed=Moe`} alt="Moe" style={{ width: 28, height: 28 }} /> : null}
          {loc.name ? <div style={{ position: 'absolute', marginTop: 28, fontSize: 10 }}>{loc.name}</div> : null}
        </div>
      )
    }
  }

  return (
    <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${MAP_WIDTH}, 48px)`, gap: 2 }}>
      {tiles}
    </div>
  )
}
