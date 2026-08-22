export type ThemeId = 'botanical' | 'midnight' | 'bloom' | 'ocean' | 'golden' | 'contrast'
export type LoadType = 'cognitive' | 'emotional' | 'physical' | 'sensory' | 'social'
export type Category = 'work' | 'home' | 'health' | 'social' | 'creative' | 'waiting'
export type PlateStatus = 'active' | 'side-plate' | 'waiting' | 'complete'
export type RequestKind = 'take-it' | 'share-it' | 'do-together' | 'help-start' | 'remind-me' | 'listen'
export type RequestStatus = 'open' | 'accepted' | 'declined' | 'completed'

export interface Profile {
  id: string
  displayName: string
  initials: string
  theme: ThemeId
  sharedStatus: 'open' | 'limited' | 'full' | 'recovering'
}

export interface CapacityCheckin {
  physical: number
  cognitive: number
  emotional: number
  sensory: number
  social: number
  recovery: number
}

export interface PlateItem {
  id: string
  title: string
  category: Category
  points: number
  loads: LoadType[]
  status: PlateStatus
  due?: string
  note?: string
  icon?: string
  steps?: string[]
  calendarEventId?: string
  ownerId: string
}

export interface CircleMember extends Profile {
  role: 'owner' | 'member'
  capacityPercent: number
}

export interface Circle {
  id: string
  name: string
  members: CircleMember[]
}

export interface PassRequest {
  id: string
  senderId: string
  recipientId?: string
  publicTitle: string
  kind: RequestKind
  status: RequestStatus
  points: number
  note: string
  createdAt: string
}

export interface ThemeOption {
  id: ThemeId
  name: string
  description: string
  colors: [string, string, string]
}
