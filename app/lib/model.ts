import type { CapacityCheckin, LoadType, PlateItem, RequestKind, ThemeOption } from '../types'

export const themes: ThemeOption[] = [
  { id: 'botanical', name: 'Botanical Calm', description: 'Grounded sage, cream, and terracotta.', colors: ['#173e35', '#e8efe9', '#d79a72'] },
  { id: 'midnight', name: 'Midnight Rest', description: 'A sensory-friendly indigo night.', colors: ['#17182d', '#b7a9e8', '#6f78c8'] },
  { id: 'bloom', name: 'Soft Bloom', description: 'Warm cream, plum, and blush.', colors: ['#542c47', '#f5e8ec', '#cc8297'] },
  { id: 'ocean', name: 'Ocean Air', description: 'Clear teal, sea mist, and sand.', colors: ['#124a52', '#dff0ef', '#e1b980'] },
  { id: 'golden', name: 'Golden Hour', description: 'Warm amber, rust, and oat.', colors: ['#6b351e', '#f4ead7', '#d69345'] },
  { id: 'contrast', name: 'High Contrast', description: 'Maximum definition and readability.', colors: ['#050505', '#ffffff', '#2878ff'] },
]

export const requestLabels: Record<RequestKind, string> = {
  'take-it': 'Take it',
  'share-it': 'Share it',
  'do-together': 'Do it together',
  'help-start': 'Help me start',
  'remind-me': 'Remember it for me',
  listen: 'Listen',
}

export function calculateCapacity(checkin: CapacityCheckin) {
  const available = checkin.physical + checkin.cognitive + checkin.emotional + checkin.sensory + checkin.social
  const recoveryPenalty = Math.max(0, checkin.recovery - 1) * 4
  return Math.max(30, Math.min(100, Math.round((available / 25) * 100 - recoveryPenalty)))
}

export function activePoints(items: PlateItem[]) {
  return items.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.points, 0)
}

export function capacityLabel(percent: number) {
  if (percent <= 55) return { label: 'Open', message: 'There is room to choose what matters.' }
  if (percent <= 80) return { label: 'Balanced', message: 'Your plan fits, with some breathing room.' }
  if (percent <= 100) return { label: 'Full', message: 'Your plate is full. New commitments need a tradeoff.' }
  return { label: 'Overflowing', message: 'This plan asks for more than today has available.' }
}

export function loadIcon(load: LoadType) {
  return ({ cognitive: '◎', emotional: '♥', physical: '↟', sensory: '✦', social: '◌' } as const)[load]
}

export function suggestRoom(items: PlateItem[], capacity: number) {
  const active = items.filter((item) => item.status === 'active').sort((a, b) => b.points - a.points)
  const used = active.reduce((sum, item) => sum + item.points, 0)
  if (used <= capacity) return []
  const largest = active[0]
  const errand = active.find((item) => ['home', 'social'].includes(item.category)) ?? active.at(-1)
  return [
    largest && { id: `split-${largest.id}`, itemId: largest.id, title: `Shrink “${largest.title}”`, detail: `Keep only the next meaningful step today and return ${Math.round(largest.points / 2)} points to your plate.`, action: 'split' as const },
    errand && { id: `pass-${errand.id}`, itemId: errand.id, title: `Pass “${errand.title}”`, detail: 'Ask your circle to take it, share it, or do it alongside you.', action: 'pass' as const },
    active.at(-1) && { id: `move-${active.at(-1)!.id}`, itemId: active.at(-1)!.id, title: `Move “${active.at(-1)!.title}”`, detail: 'Place it on the side plate intentionally—postponed is a decision, not a failure.', action: 'move' as const },
  ].filter(Boolean)
}
