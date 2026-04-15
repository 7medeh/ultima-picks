import { LOCATIONS } from './world'

export type Coord = { x: number; y: number }

// Simple map layout: width x height grid. Some tiles map to named locations by index.
export const MAP_WIDTH = 7
export const MAP_HEIGHT = 5

// assign some tiles to locations (by index into LOCATIONS)
// coordinates are 0-based (x across, y down)
export const LOCATION_TILES: Record<string, number> = {
  '1,1': 0, // Fordson Village
  '3,1': 1, // Dearborn Downtown
  '5,0': 2, // Henry Ford Museum
  '4,2': 3, // Greenfield Village
  '2,3': 4, // Rouge Park
  '3,3': 5, // The Fairlane
  '5,4': 6, // Telegraph Road
  '0,4': 7  // Edison Street
}

export function coordKey(c: Coord) { return `${c.x},${c.y}` }

export function locationAt(coord: Coord): { index?: number; name?: string } {
  const key = coordKey(coord)
  const idx = LOCATION_TILES[key]
  if (idx === undefined) return {}
  return { index: idx, name: LOCATIONS[idx] }
}

export function coordsForLocation(index: number): Coord | null {
  for (const key of Object.keys(LOCATION_TILES)) {
    if (LOCATION_TILES[key] === index) {
      const [x, y] = key.split(',').map((n) => parseInt(n, 10))
      return { x, y }
    }
  }
  return null
}

export function clampCoord(c: Coord): Coord {
  return { x: Math.max(0, Math.min(MAP_WIDTH - 1, c.x)), y: Math.max(0, Math.min(MAP_HEIGHT - 1, c.y)) }
}

export const START_POS: Coord = { x: 3, y: 1 }
