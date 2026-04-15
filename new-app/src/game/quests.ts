export type Quest = {
  id: string
  title: string
  desc: string
  locationIndex: number
  rewardXP: number
  rewardItemId?: string
  completed?: boolean
}

export const QUESTS: Quest[] = [
  { id: 'fetch-bottle', title: 'Find the Bottle', desc: 'Find a lost bottle near the fountain.', locationIndex: 6, rewardXP: 40, rewardItemId: 'potion-small' },
  { id: 'find-relic', title: 'Find the Relic', desc: 'Recover a small relic from the museum archives.', locationIndex: 2, rewardXP: 80, rewardItemId: 'potion-medium' }
]

export function questsAtLocation(idx: number) {
  return QUESTS.filter((q) => q.locationIndex === idx && !q.completed)
}
