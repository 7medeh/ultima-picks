export const LOCATIONS = [
  'Fordson Village',
  'Dearborn Downtown',
  'Henry Ford Museum',
  'Greenfield Village',
  'Rouge Park',
  'The Fairlane',
  'Telegraph Road',
  'Edison Street'
]

export function nextLocationIndex(curr: number) {
  return (curr + 1) % LOCATIONS.length
}
