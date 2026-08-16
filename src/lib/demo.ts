import type { CapacityCheckin, Circle, PassRequest, PlateItem, Profile } from '../types'

export const demoProfile: Profile = { id: 'jasmine', displayName: 'Jasmine', initials: 'JM', theme: 'botanical', sharedStatus: 'limited' }
export const defaultCheckin: CapacityCheckin = { physical: 3, cognitive: 3, emotional: 2, sensory: 3, social: 2, recovery: 4 }

export const demoItems: PlateItem[] = [
  { id: 'demo-1', title: 'Finish hackathon prototype', category: 'creative', points: 30, loads: ['cognitive', 'sensory'], status: 'active', due: 'Today', ownerId: 'jasmine' },
  { id: 'demo-2', title: 'Client handoff', category: 'work', points: 22, loads: ['cognitive', 'social'], status: 'active', due: 'Tomorrow', ownerId: 'jasmine' },
  { id: 'demo-3', title: 'Pick up groceries', category: 'home', points: 15, loads: ['physical', 'sensory'], status: 'active', due: 'Today', ownerId: 'jasmine' },
  { id: 'demo-4', title: 'Therapy appointment', category: 'health', points: 18, loads: ['emotional', 'social'], status: 'active', due: 'Thursday', ownerId: 'jasmine' },
  { id: 'demo-5', title: 'Reply to group chat', category: 'social', points: 8, loads: ['social', 'emotional'], status: 'side-plate', ownerId: 'jasmine' },
]

export const demoCircle: Circle = {
  id: 'home-circle',
  name: 'Home Team',
  members: [
    { ...demoProfile, role: 'owner', capacityPercent: 106 },
    { id: 'maria', displayName: 'Maria', initials: 'MS', theme: 'bloom', sharedStatus: 'open', role: 'member', capacityPercent: 52 },
    { id: 'devon', displayName: 'Devon', initials: 'DK', theme: 'ocean', sharedStatus: 'recovering', role: 'member', capacityPercent: 78 },
  ],
}

export const demoRequests: PassRequest[] = [
  { id: 'request-1', senderId: 'maria', recipientId: 'jasmine', publicTitle: 'Review the school form', kind: 'do-together', status: 'open', points: 10, note: 'Could we sit together for ten minutes tonight?', createdAt: '10 min ago' },
  { id: 'request-2', senderId: 'jasmine', recipientId: 'maria', publicTitle: 'Pick up groceries', kind: 'take-it', status: 'accepted', points: 15, note: 'Only the shared request is visible—not my private plate.', createdAt: 'Yesterday' },
]
