import { LOCATIONS } from './world'

export type NPC = {
  id: string
  name: string
  locationIndex: number
  desc?: string
  questGiven?: string
}

export const NPCS: NPC[] = [
  { id: 'farid', name: 'Farid', locationIndex: 0, desc: 'An elderly shop owner.', questGiven: 'fetch-bottle' },
  { id: 'layla', name: 'Layla', locationIndex: 2, desc: 'Historic docent at the museum.', questGiven: 'find-relic' },
  { id: 'omar', name: 'Omar', locationIndex: 4, desc: 'Dog-walker with rumors.' },
  { id: 'maria', name: 'Maria', locationIndex: 1, desc: 'Taxi driver who knows the streets.' }
]

export function npcsAtLocation(idx: number) {
  return NPCS.filter((n) => n.locationIndex === idx)
}
