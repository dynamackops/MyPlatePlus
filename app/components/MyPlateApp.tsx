'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ArrowRight, Bell, Brain, Check, ChevronRight, CircleUserRound, Clock3,
  HandHeart, HeartHandshake, Inbox, Lightbulb, LockKeyhole, LogOut, Menu,
  Pencil, Plus, RefreshCcw, Settings, ShieldCheck, Sparkles, Trash2, Users, WandSparkles, X,
} from 'lucide-react'
import { AuthGate } from './AuthGate'
import { demoCircle, defaultCheckin, demoItems, demoProfile, demoRequests } from '../lib/demo'
import { activePoints, calculateCapacity, capacityLabel, loadIcon, requestLabels, suggestRoom, themes } from '../lib/model'
import { createSupabaseClient, invokePlateAssistant, type SupabasePublicConfig } from '../lib/supabase'
import type { CapacityCheckin, CircleMember, PassRequest, PlateItem, Profile, RequestKind, ThemeId } from '../types'

type View = 'plate' | 'table' | 'requests' | 'insights' | 'privacy'
type AppMode = 'loading' | 'signed-out' | 'demo' | 'account'
type CircleSummary = { id: string; name: string; inviteCode: string; ownerId?: string }
type AssistantProposal = { title: string; category: PlateItem['category']; points: number; loads: PlateItem['loads']; reason: string; nextStep?: string | null; action?: 'move' | 'split' | 'pass' | null; sourceItemId?: string | null }

const categoryColor: Record<string, string> = {
  work: 'var(--work)', home: 'var(--home)', health: 'var(--health)', social: 'var(--social)', creative: 'var(--creative)', waiting: 'var(--waiting)',
}

function clientId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function App({ supabaseConfig }: { supabaseConfig: SupabasePublicConfig }) {
  const { url, publishableKey } = supabaseConfig
  const supabase = useMemo(() => createSupabaseClient({ url, publishableKey }), [url, publishableKey])
  const isSupabaseConfigured = Boolean(supabase)
  const [mode, setMode] = useState<AppMode>(supabase ? 'loading' : 'signed-out')
  const [userId, setUserId] = useState<string | null>(null)
  const [view, setView] = useState<View>('plate')
  const [profile, setProfile] = useState<Profile>({ id: '', displayName: 'My Plate', initials: 'MP', theme: 'botanical', sharedStatus: 'limited' })
  const [items, setItems] = useState<PlateItem[]>([])
  const [requests, setRequests] = useState<PassRequest[]>([])
  const [checkin, setCheckin] = useState<CapacityCheckin>(defaultCheckin)
  const [circle, setCircle] = useState<CircleSummary | null>(null)
  const [circles, setCircles] = useState<CircleSummary[]>([])
  const [members, setMembers] = useState<CircleMember[]>([])
  const [checkinHistory, setCheckinHistory] = useState<Array<CapacityCheckin & { checkedInOn: string; availablePoints: number }>>([])
  const [modal, setModal] = useState<'none' | 'setup' | 'profile' | 'checkin' | 'brain' | 'room' | 'pass' | 'add' | 'edit' | 'delete' | 'invite'>('none')
  const [selectedItem, setSelectedItem] = useState<PlateItem | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')

  const capacity = calculateCapacity(checkin)
  const used = activePoints(items)
  const percent = Math.round((used / capacity) * 100)
  const fullness = capacityLabel(percent)
  const suggestions = useMemo(() => suggestRoom(items, capacity), [items, capacity])

  async function loadRequests(circleId?: string) {
    if (!supabase || !circleId) { setRequests([]); return }
    const { data } = await supabase.from('pass_requests').select('id, sender_id, recipient_id, public_title, public_note, kind, status, points, created_at').eq('circle_id', circleId).order('created_at', { ascending: false })
    setRequests((data ?? []).map((request) => ({
      id: request.id, senderId: request.sender_id, recipientId: request.recipient_id ?? undefined,
      publicTitle: request.public_title, note: request.public_note, kind: request.kind,
      status: request.status, points: request.points,
      createdAt: new Date(request.created_at).toLocaleDateString(),
    })) as PassRequest[])
  }

  async function loadCircle(nextCircle: CircleSummary, self: Profile) {
    if (!supabase) return
    const { data: membershipRows } = await supabase.from('circle_members').select('user_id, role').eq('circle_id', nextCircle.id)
    const userIds = (membershipRows ?? []).map((row) => row.user_id)
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, theme, shared_status').in('id', userIds)
      : { data: [] }
    const profileMap = new Map((profileRows ?? []).map((row) => [row.id, row]))
    setMembers((membershipRows ?? []).map((membership) => {
      const row = profileMap.get(membership.user_id)
      const displayName = row?.display_name ?? (membership.user_id === self.id ? self.displayName : 'Circle member')
      return {
        id: membership.user_id, displayName, initials: initialsFor(displayName), theme: (row?.theme ?? self.theme) as ThemeId,
        sharedStatus: row?.shared_status ?? 'limited', role: membership.role, capacityPercent: 0,
      }
    }) as CircleMember[])
    setCircle(nextCircle)
    localStorage.setItem('myplate-active-circle', nextCircle.id)
    await loadRequests(nextCircle.id)
  }

  async function loadAccount(id: string, email?: string) {
    if (!supabase) return
    setMode('loading')
    setUserId(id)
    const [profileResult, itemsResult, checkinResult, checkinHistoryResult, membershipsResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, theme, shared_status').eq('id', id).single(),
      supabase.from('plate_items').select('id, owner_id, title, private_note, category, points, loads, status, due_on').eq('owner_id', id).order('created_at', { ascending: false }),
      supabase.from('capacity_checkins').select('physical, cognitive, emotional, sensory, social, recovery').eq('user_id', id).order('checked_in_on', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('capacity_checkins').select('physical, cognitive, emotional, sensory, social, recovery, available_points, checked_in_on').eq('user_id', id).order('checked_in_on', { ascending: false }).limit(30),
      supabase.from('circle_members').select('circle_id, role').eq('user_id', id),
    ])
    const fallbackName = email?.split('@')[0]?.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'My Plate'
    const row = profileResult.data
    const nextProfile: Profile = row ? {
      id: row.id,
      displayName: row.display_name,
      initials: initialsFor(row.display_name),
      theme: row.theme as ThemeId,
      sharedStatus: row.shared_status,
    } : { id, displayName: fallbackName, initials: initialsFor(fallbackName), theme: 'botanical', sharedStatus: 'limited' }
    const nextItems = (itemsResult.data ?? []).map((item) => ({
      id: item.id, ownerId: item.owner_id, title: item.title, note: item.private_note ?? undefined,
      category: item.category, points: item.points, loads: item.loads, status: item.status,
      due: item.due_on ?? undefined,
    })) as PlateItem[]
    const latest = checkinResult.data
    setProfile(nextProfile)
    setItems(nextItems)
    if (latest) setCheckin(latest)
    setCheckinHistory((checkinHistoryResult.data ?? []).map((row) => ({ physical: row.physical, cognitive: row.cognitive, emotional: row.emotional, sensory: row.sensory, social: row.social, recovery: row.recovery, availablePoints: row.available_points, checkedInOn: row.checked_in_on })))
    const circleIds = (membershipsResult.data ?? []).map((membership) => membership.circle_id)
    const { data: circleRows } = circleIds.length ? await supabase.from('circles').select('id, name, invite_code, owner_id').in('id', circleIds) : { data: [] }
    const nextCircles = (circleRows ?? []).map((row) => ({ id: row.id, name: row.name, inviteCode: row.invite_code, ownerId: row.owner_id }))
    setCircles(nextCircles)
    const remembered = localStorage.getItem('myplate-active-circle')
    const nextCircle = nextCircles.find((candidate) => candidate.id === remembered) ?? nextCircles.find((candidate) => candidate.ownerId === id) ?? nextCircles[0]
    if (nextCircle) await loadCircle(nextCircle, nextProfile)
    else { setCircle(null); setMembers([]); setRequests([]) }
    setMode('account')
    if (!latest && nextItems.length === 0) setModal('setup')
  }

  useEffect(() => {
    if (!supabase) return
    let activeUserId: string | null = null
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session && activeUserId !== data.session.user.id) {
        activeUserId = data.session.user.id
        void loadAccount(data.session.user.id, data.session.user.email)
      } else if (!data.session) setMode('signed-out')
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase may emit SIGNED_IN again when a browser tab regains focus.
      // Only hydrate when the actual account changes so open modals and drafts stay intact.
      if (event === 'SIGNED_IN' && session && activeUserId !== session.user.id) {
        activeUserId = session.user.id
        void loadAccount(session.user.id, session.user.email)
      }
      if (event === 'SIGNED_OUT') { activeUserId = null; setUserId(null); setMode('signed-out') }
    })
    return () => { cancelled = true; data.subscription.unsubscribe() }
    // The auth listener is intentionally registered once; it reads fresh account data on each event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!supabase || mode !== 'account' || !circle) return
    const channel = supabase.channel(`pass-requests-${circle.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'pass_requests', filter: `circle_id=eq.${circle.id}` }, () => void loadRequests(circle.id)).subscribe()
    return () => { void supabase.removeChannel(channel) }
    // Re-subscribe only when the active table changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, circle?.id])

  function enterDemo() {
    setMode('demo')
    setProfile({ ...demoProfile, theme: (localStorage.getItem('myplate-theme') as ThemeId) || demoProfile.theme })
    setItems(demoItems)
    setRequests(demoRequests)
    setCheckin(defaultCheckin)
    setCircle({ id: demoCircle.id, name: demoCircle.name, inviteCode: 'DEMO-PLUS' })
    setCircles([{ id: demoCircle.id, name: demoCircle.name, inviteCode: 'DEMO-PLUS' }])
    setMembers(demoCircle.members)
    setCheckinHistory([])
  }

  function exitDemo() {
    setItems([]); setRequests([]); setCircle(null); setCircles([]); setMembers([]); setMode('signed-out'); setView('plate')
  }

  if (mode === 'loading') return <main className="loading-shell"><div className="loading-plate"><Sparkles /><b>Setting your table…</b><span>Loading your private plate</span></div></main>
  if (mode === 'signed-out') return <AuthGate supabase={supabase} onDemo={enterDemo} />

  async function saveProfile(next: Profile) {
    setProfile({ ...next, initials: initialsFor(next.displayName) })
    localStorage.setItem('myplate-theme', next.theme)
    if (mode === 'account' && userId && supabase) {
      const { error } = await supabase.from('profiles').update({ display_name: next.displayName, theme: next.theme, shared_status: next.sharedStatus }).eq('id', userId)
      setNotice(error ? 'We could not save those settings yet.' : 'Profile saved.')
    }
    setModal('none')
  }

  async function saveCheckin(next: CapacityCheckin) {
    setCheckin(next)
    if (mode === 'account' && userId && supabase) {
      const today = new Date().toISOString().slice(0, 10)
      const availablePoints = calculateCapacity(next)
      const { error } = await supabase.from('capacity_checkins').upsert({ user_id: userId, ...next, available_points: availablePoints, checked_in_on: today }, { onConflict: 'user_id,checked_in_on' })
      if (error) setNotice('Your check-in is visible here, but it could not be saved.')
      else setCheckinHistory((current) => [{ ...next, availablePoints, checkedInOn: today }, ...current.filter((row) => row.checkedInOn !== today)])
    }
    setModal('none')
  }

  async function addItem(item: PlateItem) {
    if (mode === 'demo' || !supabase || !userId) { setItems((current) => [item, ...current]); setModal('none'); return true }
    const { data, error } = await supabase.from('plate_items').insert({ owner_id: userId, title: item.title, private_note: item.note ?? null, category: item.category, points: item.points, loads: item.loads, status: item.status, due_on: item.due || null }).select('id').single()
    if (error) { setNotice('That commitment could not be saved. Please try again.'); return false }
    setItems((current) => [{ ...item, id: data.id, ownerId: userId }, ...current])
    setModal('none')
    return true
  }

  async function applyBrainDump(newItems: PlateItem[]) {
    if (mode === 'demo' || !supabase || !userId) { setItems((current) => [...newItems, ...current]); setModal('none'); return true }
    const rows = newItems.map((item) => ({ owner_id: userId, title: item.title, category: item.category, points: item.points, loads: item.loads, status: item.status }))
    const { data, error } = await supabase.from('plate_items').insert(rows).select('id, owner_id, title, category, points, loads, status')
    if (error) { setNotice('Your ideas stayed private, but they could not be added yet.'); return false }
    setItems((current) => ([...(data ?? []).map((item) => ({ id: item.id, ownerId: item.owner_id, title: item.title, category: item.category, points: item.points, loads: item.loads, status: item.status } as PlateItem)), ...current]))
    setModal('none')
    return true
  }

  async function updateItem(nextItem: PlateItem) {
    if (mode === 'demo' || !supabase || !userId) {
      setItems((current) => current.map((item) => item.id === nextItem.id ? nextItem : item))
      setSelectedItem(null); setModal('none'); setNotice('Commitment updated.')
      return true
    }
    const { data, error } = await supabase.from('plate_items').update({
      title: nextItem.title, private_note: nextItem.note ?? null, category: nextItem.category,
      points: nextItem.points, loads: nextItem.loads, status: nextItem.status, due_on: nextItem.due || null,
      updated_at: new Date().toISOString(),
    }).eq('id', nextItem.id).eq('owner_id', userId).select('id').single()
    if (error || !data) { setNotice('That commitment could not be updated. Please try again.'); return false }
    setItems((current) => current.map((item) => item.id === nextItem.id ? nextItem : item))
    setSelectedItem(null); setModal('none'); setNotice('Commitment updated.')
    return true
  }

  async function deleteItem(item: PlateItem) {
    if (mode === 'account' && supabase && userId) {
      const { data, error } = await supabase.from('plate_items').delete().eq('id', item.id).eq('owner_id', userId).select('id').single()
      if (error || !data) { setNotice('That commitment could not be deleted. Please try again.'); return }
    }
    clearSessionDraft(`myplate-edit-draft:${item.id}`)
    setItems((current) => current.filter((candidate) => candidate.id !== item.id))
    setSelectedItem(null); setModal('none'); setNotice('Commitment deleted.')
  }

  function applyRoom(action: string, itemId: string) {
    if (action === 'move') setItems((current) => current.map((item) => item.id === itemId ? { ...item, status: 'side-plate' } : item))
    if (action === 'split') setItems((current) => current.map((item) => item.id === itemId ? { ...item, points: Math.max(5, Math.round(item.points / 2)), title: `${item.title} · next step` } : item))
    if (action === 'pass') {
      const item = items.find((candidate) => candidate.id === itemId)
      if (item) { setSelectedItem(item); setModal('pass'); return }
    }
    if (mode === 'account' && supabase) {
      const current = items.find((item) => item.id === itemId)
      if (current && action === 'move') void supabase.from('plate_items').update({ status: 'side-plate' }).eq('id', itemId)
      if (current && action === 'split') void supabase.from('plate_items').update({ points: Math.max(5, Math.round(current.points / 2)), title: `${current.title} · next step` }).eq('id', itemId)
    }
    setModal('none')
  }

  async function sendPass(kind: RequestKind, recipientId?: string, note = '') {
    if (!selectedItem) return
    if (mode === 'account' && supabase && userId && circle) {
      const { data, error } = await supabase.from('pass_requests').insert({
        circle_id: circle.id, sender_id: userId, recipient_id: recipientId || null, source_item_id: selectedItem.id,
        public_title: selectedItem.title, public_note: note.trim(), kind, points: selectedItem.points,
      }).select('id, sender_id, recipient_id, public_title, public_note, kind, status, points, created_at').single()
      if (error) { setNotice('That support request could not be sent. Please try again.'); return }
      setRequests((current) => [{ id: data.id, senderId: data.sender_id, recipientId: data.recipient_id ?? undefined, publicTitle: data.public_title, note: data.public_note, kind: data.kind, status: data.status, points: data.points, createdAt: 'Just now' } as PassRequest, ...current])
      await supabase.from('plate_items').update({ status: 'waiting' }).eq('id', selectedItem.id)
    } else {
      setRequests((current) => [{ id: clientId(), senderId: profile.id, recipientId, publicTitle: selectedItem.title, kind, status: 'open', points: selectedItem.points, note: note.trim() || 'I chose to share only this request—not the rest of my plate.', createdAt: 'Just now' }, ...current])
    }
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, status: 'waiting' } : item))
    setSelectedItem(null)
    setModal('none')
    setView('requests')
  }

  async function respondToRequest(id: string, status: 'accepted' | 'declined') {
    if (mode === 'account' && supabase) {
      const { error } = await supabase.rpc('respond_to_pass_request', { request_id: id, decision: status })
      if (error) { setNotice('Your response could not be saved. Please try again.'); return }
    }
    setRequests((current) => current.map((request) => request.id === id ? { ...request, status, recipientId: request.recipientId ?? userId ?? undefined } : request))
  }

  async function joinCircle(code: string) {
    if (!supabase || !userId) return 'Sign in before joining a table.'
    const { data, error } = await supabase.rpc('join_circle_by_code', { code: code.trim().toLowerCase() })
    if (error || !data) return error?.message.includes('Invalid') ? 'That invite code was not found.' : 'We could not join that table yet.'
    localStorage.setItem('myplate-active-circle', data)
    await loadAccount(userId)
    setModal('none')
    setView('table')
    setNotice('Welcome to your trusted circle.')
    return null
  }

  async function switchCircle(circleId: string) {
    const next = circles.find((candidate) => candidate.id === circleId)
    if (next) await loadCircle(next, profile)
  }

  return (
    <div className={`app theme-${profile.theme}`}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
        <a className="brand" href="#top" onClick={() => setView('plate')}><span className="brand-mark">+</span><span>MyPlate<b>+</b></span></a>
        <div className="top-actions">
          {mode === 'demo' ? <button className="demo-chip demo-exit" onClick={exitDemo}>Demo mode · Exit</button> : <span className="demo-chip"><LockKeyhole size={13} /> Private account</span>}
          <button className="icon-button" aria-label="No new notifications" title="No new notifications" disabled><Bell /></button>
          <button className="avatar-button" aria-label="Open profile" onClick={() => setModal('profile')}><span>{profile.initials}</span></button>
        </div>
      </header>

      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <button className="close-mobile mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
        <nav aria-label="Primary navigation">
          <NavButton active={view === 'plate'} icon={<CircleUserRound />} label="My Plate" onClick={() => { setView('plate'); setMobileNav(false) }} />
          <NavButton active={view === 'table'} icon={<Users />} label="Our Table" onClick={() => { setView('table'); setMobileNav(false) }} />
          <NavButton active={view === 'requests'} icon={<Inbox />} label="Passed to Me" badge={requests.filter((request) => request.status === 'open' && request.senderId !== profile.id).length} onClick={() => { setView('requests'); setMobileNav(false) }} />
          <NavButton active={view === 'insights'} icon={<Lightbulb />} label="Insights" onClick={() => { setView('insights'); setMobileNav(false) }} />
        </nav>
        <div className="sidebar-bottom">
          <NavButton active={view === 'privacy'} icon={<ShieldCheck />} label="AI & Privacy" onClick={() => { setView('privacy'); setMobileNav(false) }} />
          {mode === 'account' && isSupabaseConfigured && <NavButton active={false} icon={<LogOut />} label="Sign out" onClick={() => void supabase?.auth.signOut()} />}
          <button className="profile-row" onClick={() => setModal('profile')}><span className="mini-avatar">{profile.initials}</span><span><b>{profile.displayName}</b><small>{themes.find((t) => t.id === profile.theme)?.name}</small></span><Settings size={17} /></button>
        </div>
      </aside>

      <main id="main" className="main-content">
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {view === 'plate' && <PlateView name={profile.displayName} items={items} capacity={capacity} used={used} percent={percent} fullness={fullness} onCheckin={() => setModal('checkin')} onBrain={() => setModal('brain')} onAdd={() => setModal('add')} onRoom={() => setModal('room')} onEdit={(item) => { setSelectedItem(item); setModal('edit') }} onPass={(item) => { setSelectedItem(item); setModal('pass') }} />}
        {view === 'table' && <TableView isDemo={mode === 'demo'} profile={profile} circle={circle} circles={circles} members={members} onCircleChange={switchCircle} onInvite={() => setModal('invite')} onRequest={() => { const item = items.find((i) => i.status === 'active'); if (item) { setSelectedItem(item); setModal('pass') } else setModal('add') }} />}
        {view === 'requests' && <RequestsView requests={requests} members={members} userId={profile.id} onUpdate={respondToRequest} />}
        {view === 'insights' && <InsightsView isDemo={mode === 'demo'} items={items} history={checkinHistory} requests={requests} />}
        {view === 'privacy' && <PrivacyView />}
      </main>

      {modal === 'setup' && <SetupModal profile={profile} checkin={checkin} onSave={async (nextProfile, nextCheckin) => { await saveProfile(nextProfile); await saveCheckin(nextCheckin); setModal('add') }} />}
      {modal === 'profile' && <ProfileModal profile={profile} onSave={saveProfile} onClose={() => setModal('none')} />}
      {modal === 'checkin' && <CheckinModal value={checkin} onSave={saveCheckin} onClose={() => setModal('none')} />}
      {modal === 'brain' && <BrainDumpModal supabase={supabase} ownerId={profile.id} onApply={applyBrainDump} onClose={() => setModal('none')} />}
      {modal === 'add' && <AddItemModal ownerId={profile.id} onAdd={addItem} onClose={() => setModal('none')} />}
      {modal === 'edit' && selectedItem && <EditItemModal item={selectedItem} onSave={updateItem} onDelete={() => setModal('delete')} onClose={() => { setSelectedItem(null); setModal('none') }} />}
      {modal === 'delete' && selectedItem && <DeleteItemModal item={selectedItem} onConfirm={() => void deleteItem(selectedItem)} onBack={() => setModal('edit')} onClose={() => { setSelectedItem(null); setModal('none') }} />}
      {modal === 'invite' && <InviteModal circle={circle} canJoin={mode === 'account'} onJoin={joinCircle} onClose={() => { setSelectedItem(null); setModal('none') }} />}
      {modal === 'room' && <RoomModal supabase={supabase} used={used} capacity={capacity} items={items} quickSuggestions={suggestions} canUseAi={mode === 'account'} onApply={applyRoom} onClose={() => setModal('none')} />}
      {modal === 'pass' && selectedItem && <PassModal item={selectedItem} members={members.filter((member) => member.id !== profile.id)} onInvite={() => setModal('invite')} onSend={sendPass} onClose={() => { setSelectedItem(null); setModal('none') }} />}
    </div>
  )
}

function initialsFor(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MP'
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b className="nav-badge">{badge}</b> : null}</button>
}

function PlateView({ name, items, capacity, used, percent, fullness, onCheckin, onBrain, onAdd, onRoom, onEdit, onPass }: {
  name: string; items: PlateItem[]; capacity: number; used: number; percent: number; fullness: { label: string; message: string };
  onCheckin: () => void; onBrain: () => void; onAdd: () => void; onRoom: () => void; onEdit: (item: PlateItem) => void; onPass: (item: PlateItem) => void
}) {
  const active = items.filter((item) => item.status === 'active')
  const side = items.filter((item) => item.status === 'side-plate')
  return <>
    <section className="page-heading">
      <div><p className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()}</p><h1>Welcome, {name}.</h1><p>Your capacity can change. Your plan can change with it.</p></div>
      <div className="heading-actions"><button className="secondary-button" onClick={onBrain}><Brain size={18} /> Brain dump</button><button className="primary-button" onClick={onCheckin}><Sparkles size={18} /> Check in</button></div>
    </section>
    <section className="capacity-card">
      <div className="capacity-score"><span>{percent}%</span><div><b>{fullness.label}</b><small>{used} of {capacity} available points</small></div></div>
      <p>{fullness.message}</p>
      <div className="capacity-bar"><span style={{ width: `${Math.min(percent, 100)}%` }} /></div>
      <button className="make-room-button" onClick={onRoom}><WandSparkles size={19} /> Make Room+ <ChevronRight size={18} /></button>
    </section>
    <section className="dashboard-grid">
      <article className="plate-card">
        <div className="section-title"><div><p className="eyebrow">YOUR PRIVATE PLATE</p><h2>What you’re carrying</h2></div><span className="legend-dot">Size shows capacity</span></div>
        <div className="plate-wrap">
          <div className="plate-rim" aria-label={`${active.length} active commitments on your plate`}>
            <div className="plate-center">
              {active.map((item, index) => <button key={item.id} className={`plate-object object-${index % 6}`} style={{ '--object-size': `${Math.max(70, item.points * 3.4)}px`, '--object-color': categoryColor[item.category] } as React.CSSProperties} onClick={() => onEdit(item)} aria-label={`Edit ${item.title}, ${item.points} capacity points`}><strong>{item.title}</strong><small>{item.points} pts</small><span>{item.loads.map(loadIcon).join(' ')}</span></button>)}
              {active.length === 0 && <div className="empty-plate"><Sparkles /><b>Your plate is ready.</b><span>Add what you’re carrying—big, small, visible, or invisible.</span><button className="primary-button" onClick={onAdd}><Plus size={17} /> Add your first commitment</button></div>}
            </div>
          </div>
        </div>
        <div className="load-key"><span>◎ Cognitive</span><span>♥ Emotional</span><span>↟ Physical</span><span>✦ Sensory</span><span>◌ Social</span></div>
      </article>
      <aside className="today-card">
        <div className="section-title"><div><p className="eyebrow">TODAY’S PLAN</p><h2>Commitments</h2></div><button className="small-add" aria-label="Add commitment" onClick={onAdd}><Plus /></button></div>
        <div className="item-list">{active.map((item) => <div className="item-row" key={item.id}><span className="item-color" style={{ background: categoryColor[item.category] }} /><button className="item-summary" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}><b>{item.title}</b><small>{item.category} · {item.points} pts {item.due ? `· ${item.due}` : ''}</small></button><div className="item-actions"><button className="icon-button subtle" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} title="Edit"><Pencil /></button><button className="icon-button subtle" onClick={() => onPass(item)} aria-label={`Pass ${item.title}`} title="Pass the Plate"><HandHeart /></button></div></div>)}</div>
        {active.length === 0 && <div className="empty-list"><p>Nothing has been added yet.</p><button className="secondary-button full" onClick={onAdd}><Plus size={17} /> Add a commitment</button></div>}
        {side.length > 0 && <div className="side-plate"><span><Clock3 size={17} /> Side plate</span>{side.map((item) => <button className="side-item-button" key={item.id} onClick={() => onEdit(item)}><small>{item.title}</small><Pencil size={14} /></button>)}</div>}
      </aside>
    </section>
  </>
}

function TableView({ isDemo, profile, circle, circles, members, onCircleChange, onInvite, onRequest }: { isDemo: boolean; profile: Profile; circle: CircleSummary | null; circles: CircleSummary[]; members: CircleMember[]; onCircleChange: (id: string) => void; onInvite: () => void; onRequest: () => void }) {
  const visibleMembers = isDemo ? demoCircle.members : members
  return <>
    <section className="page-heading"><div><p className="eyebrow">YOUR TRUSTED CIRCLE</p><h1>Our Table</h1><p>Shared care without shared surveillance.</p></div><button className="primary-button" onClick={onRequest}><HandHeart size={18} /> Ask for support</button></section>
    <div className="table-hero">
      <div><span className="status-dot open" /> <b>{circle?.name ?? 'My Trusted Circle'}</b><small>{visibleMembers.length} {visibleMembers.length === 1 ? 'person' : 'people'} · private circle</small></div>
      {circles.length > 1 && <label className="circle-switcher"><span>Current table</span><select value={circle?.id ?? ''} onChange={(event) => onCircleChange(event.target.value)}>{circles.map((option) => <option value={option.id} key={option.id}>{option.name}{option.ownerId === profile.id ? ' · mine' : ''}</option>)}</select></label>}
      <button className="secondary-button" onClick={onInvite}><Plus size={17} /> Invite someone</button>
    </div>
    <section className="member-grid">
      {visibleMembers.map((member) => <article className="member-card" key={member.id}><div className="member-top"><span className={`member-avatar member-${member.theme}`}>{member.initials}</span><div><h3>{member.displayName}{member.id === profile.id ? ' · You' : ''}</h3><p><span className={`status-dot ${member.sharedStatus}`} /> {member.sharedStatus}</p></div></div>{isDemo && <div className="shared-meter"><span style={{ width: `${Math.min(member.capacityPercent, 100)}%` }} /></div>}<p className="member-summary">{member.id === profile.id ? 'Your private plate stays private. You choose what to pass.' : member.sharedStatus === 'open' ? 'Open to support requests today.' : member.sharedStatus === 'recovering' ? 'Protecting recovery time.' : 'May have limited room for support today.'}</p></article>)}
      {!isDemo && visibleMembers.length === 1 && <button className="member-card add-member-card" onClick={onInvite}><Plus /><b>Invite or join someone</b><span>Bring family, a partner, or a trusted friend to the table.</span></button>}
    </section>
    <section className="shared-board"><div className="section-title"><div><p className="eyebrow">SHARED CARE</p><h2>What this table can do</h2></div></div>{isDemo ? <div className="shared-items"><div><span className="shared-icon">⌂</span><b>Plan Sunday dinner</b><small>Maria + Jasmine · shared</small></div><div><span className="shared-icon">✦</span><b>Prepare for family visit</b><small>3 contributors · 2 steps left</small></div><div className="empty-shared"><Plus /><span>Add a shared responsibility</span></div></div> : <div className="empty-shared-state"><HeartHandshake /><h3>{visibleMembers.length > 1 ? 'Your circle is connected.' : 'Your shared table starts with trust.'}</h3><p>{visibleMembers.length > 1 ? 'Choose a private commitment and pass only the support request your circle needs to see.' : 'Invite someone or join their table with a code before passing a plate.'}</p><button className="primary-button" onClick={visibleMembers.length > 1 ? onRequest : onInvite}>{visibleMembers.length > 1 ? 'Pass a plate item' : 'Invite or join'}</button></div>}</section>
  </>
}

function RequestsView({ requests, members, userId, onUpdate }: { requests: PassRequest[]; members: CircleMember[]; userId: string; onUpdate: (id: string, status: 'accepted' | 'declined') => void }) {
  const incoming = requests.filter((request) => request.status === 'open' && request.senderId !== userId)
  const sent = requests.filter((request) => request.status === 'open' && request.senderId === userId)
  const history = requests.filter((request) => request.status !== 'open')
  const person = (id?: string) => members.find((member) => member.id === id)
  return <>
    <section className="page-heading"><div><p className="eyebrow">SUPPORT, WITH CONSENT</p><h1>Passed to Me</h1><p>Accept what fits. Declining is always allowed.</p></div></section>
    <section className="request-layout"><div><h2>Waiting for you <span>{incoming.length}</span></h2>{incoming.map((request) => { const sender = person(request.senderId); return <article className="request-card" key={request.id}><div className="request-meta"><span className={`member-avatar member-${sender?.theme ?? 'bloom'}`}>{sender?.initials ?? 'MP'}</span><span><b>{sender?.displayName ?? 'Someone at your table'} asked to {requestLabels[request.kind].toLowerCase()}</b><small>{request.createdAt}</small></span></div><h3>{request.publicTitle}</h3>{request.note && <p>{request.note}</p>}<div className="request-impact"><span>{request.points} pts</span><span>Only this request was shared</span></div><div className="request-actions"><button className="secondary-button" onClick={() => onUpdate(request.id, 'declined')}>Not today</button><button className="primary-button" onClick={() => onUpdate(request.id, 'accepted')}><Check size={17} /> Accept</button></div></article>})}{incoming.length === 0 && <div className="empty-request"><Inbox /><b>No requests are waiting.</b><span>Your circle can ask for support without revealing their private plate.</span></div>}</div><aside><h2>Sent by you</h2>{sent.map((request) => <div className="history-row" key={request.id}><span className="history-icon open"><Clock3 /></span><div><b>{request.publicTitle}</b><small>{person(request.recipientId)?.displayName ?? 'Anyone at the table'} · waiting</small></div></div>)}{sent.length === 0 && <p className="muted-copy">No open requests.</p>}<h2 className="history-heading">Recent</h2>{history.map((request) => <div className="history-row" key={request.id}><span className={`history-icon ${request.status}`}><Check /></span><div><b>{request.publicTitle}</b><small>{requestLabels[request.kind]} · {request.status}</small></div></div>)}</aside></section>
  </>
}

function InsightsView({ isDemo, items, history, requests }: { isDemo: boolean; items: PlateItem[]; history: Array<CapacityCheckin & { checkedInOn: string; availablePoints: number }>; requests: PassRequest[] }) {
  if (isDemo) return <><section className="page-heading"><div><p className="eyebrow">PRIVATE PATTERNS · DEMO DATA</p><h1>What your capacity is teaching you</h1><p>Observations—not diagnoses, predictions, or judgments.</p></div></section><section className="insight-grid"><article className="hero-insight"><span className="insight-symbol">◎</span><p className="eyebrow">EXAMPLE INSIGHT</p><h2>Cognitive work may need a softer landing.</h2><p>This sample shows how an evidence-backed pattern would appear after several check-ins.</p></article></section></>
  if (history.length < 3) return <><section className="page-heading"><div><p className="eyebrow">PRIVATE PATTERNS</p><h1>What your capacity is teaching you</h1><p>Observations—not diagnoses, predictions, or judgments.</p></div></section><section className="empty-insights"><Lightbulb /><h2>{history.length}/3 check-ins recorded.</h2><p>Complete {3 - history.length} more {3 - history.length === 1 ? 'check-in' : 'check-ins'} before MyPlate+ describes a pattern. We will never invent a trend from too little data.</p></section></>
  const values = history.map((row) => row.availablePoints)
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  const active = items.filter((item) => item.status === 'active')
  const heaviest = [...active].sort((a, b) => b.points - a.points)[0]
  const accepted = requests.filter((request) => request.status === 'accepted').length
  return <><section className="page-heading"><div><p className="eyebrow">PRIVATE PATTERNS · YOUR DATA</p><h1>What your capacity is teaching you</h1><p>Based on {history.length} recorded check-ins—not a diagnosis or prediction.</p></div><span className="secondary-button static"><RefreshCcw size={17} /> Last 30 check-ins</span></section><section className="insight-grid"><article className="hero-insight"><span className="insight-symbol">◎</span><p className="eyebrow">YOUR RECORDED BASELINE</p><h2>Your average available capacity was {average} points.</h2><p>Your recorded range was {Math.min(...values)}–{Math.max(...values)} points. Variation is information, not failure.</p></article><article><p className="eyebrow">HEAVIEST ACTIVE ITEM</p><h3>{heaviest?.title ?? 'No active items'}</h3><strong>{heaviest ? `${heaviest.points} pts` : '—'}</strong><p>{heaviest ? `You marked this as ${heaviest.loads.join(' + ')} load.` : 'Add a commitment to compare its weight.'}</p></article><article><p className="eyebrow">SUPPORT ACCEPTED</p><h3>Passed plates</h3><strong>{accepted}</strong><p>{accepted ? 'Accepted support requests recorded at this table.' : 'No accepted support requests yet.'}</p></article><article><p className="eyebrow">CURRENT PLATE</p><h3>{active.length} active</h3><strong>{activePoints(items)} pts</strong><p>These values come directly from what you chose to record.</p></article></section></>
}

function PrivacyView() {
  return <><section className="page-heading"><div><p className="eyebrow">RESPONSIBLE BY DESIGN</p><h1>AI & Privacy Center</h1><p>You should never have to guess what the system knows or shares.</p></div></section><section className="privacy-grid"><article className="privacy-hero"><ShieldCheck /><div><p className="eyebrow">YOUR PLATE IS PRIVATE</p><h2>Nothing is shared until you choose it.</h2><p>Your circle cannot see your brain dumps, private commitments, check-ins, notes, or AI conversations. Pass the Plate creates a new, limited request containing only the fields you approve.</p></div></article>{[
    ['AI suggestions require approval', 'MyPlate+ can propose. Only you can apply, send, move, split, or pass.'],
    ['No diagnosis or productivity scoring', 'Capacity estimates are editable planning tools—not medical conclusions or judgments of worth.'],
    ['Minimum necessary context', 'The assistant receives only the information required for the request. Model storage is disabled.'],
    ['A receipt before every share', 'Before sending, you see exactly which title, support type, points, and optional note will leave your private plate.'],
  ].map(([title, body], index) => <article className="privacy-item" key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</section><section className="data-controls"><div><LockKeyhole /><span><b>Private by default</b><small>Circle members only see the support requests you intentionally send.</small></span></div><span className="privacy-status"><ShieldCheck size={17} /> Protected</span></section></>
}

function Modal({ children, title, onClose, wide = false }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>{children}</section></div>
}

function SetupModal({ profile, checkin, onSave }: { profile: Profile; checkin: CapacityCheckin; onSave: (profile: Profile, checkin: CapacityCheckin) => void }) {
  const [draftProfile, setDraftProfile] = useState(profile)
  const [draftCheckin, setDraftCheckin] = useState(checkin)
  const labels: [keyof CapacityCheckin, string][] = [['physical', 'Physical energy'], ['cognitive', 'Cognitive clarity'], ['emotional', 'Emotional bandwidth'], ['sensory', 'Sensory tolerance'], ['social', 'Social capacity'], ['recovery', 'Recovery need']]
  return <Modal title="Set up your plate" onClose={() => {}} wide><p className="eyebrow">WELCOME TO YOUR OWN PLATE</p><h2>Let’s make this feel like yours.</h2><p className="modal-intro">Choose a name and atmosphere, then estimate what today has available. You can change everything later.</p><label className="field-label">What should we call you?<input value={draftProfile.displayName} maxLength={80} onChange={(event) => setDraftProfile({ ...draftProfile, displayName: event.target.value })} /></label><div className="theme-grid compact">{themes.map((theme) => <button type="button" className={`theme-option ${draftProfile.theme === theme.id ? 'selected' : ''}`} key={theme.id} onClick={() => setDraftProfile({ ...draftProfile, theme: theme.id })}><span className="theme-preview" style={{ background: theme.colors[1] }}><i style={{ background: theme.colors[0] }} /><i style={{ background: theme.colors[2] }} /></span><b>{theme.name}</b>{draftProfile.theme === theme.id && <span className="selected-check"><Check /></span>}</button>)}</div><h3 className="form-section-title">What does today have available?</h3><div className="checkin-list compact">{labels.map(([key, label]) => <label key={key}><span><b>{label}</b></span><input type="range" min="1" max="5" value={draftCheckin[key]} onChange={(event) => setDraftCheckin({ ...draftCheckin, [key]: Number(event.target.value) })} /><strong>{draftCheckin[key]}/5</strong></label>)}</div><div className="modal-footer end"><button className="primary-button" disabled={!draftProfile.displayName.trim()} onClick={() => onSave({ ...draftProfile, displayName: draftProfile.displayName.trim() }, draftCheckin)}>Set my table <ArrowRight size={17} /></button></div></Modal>
}

function ProfileModal({ profile, onSave, onClose }: { profile: Profile; onSave: (profile: Profile) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(profile)
  return <Modal title="Profile and appearance" onClose={onClose} wide><p className="eyebrow">YOUR PLATE, YOUR WAY</p><h2>Profile & appearance</h2><label className="field-label">Display name<input value={draft.displayName} maxLength={80} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label className="field-label">Shared capacity status<select value={draft.sharedStatus} onChange={(event) => setDraft({ ...draft, sharedStatus: event.target.value as Profile['sharedStatus'] })}><option value="open">Open to support</option><option value="limited">Limited capacity</option><option value="full">Plate is full</option><option value="recovering">Recovering</option></select></label><div className="theme-grid">{themes.map((theme) => <button type="button" className={`theme-option ${draft.theme === theme.id ? 'selected' : ''}`} key={theme.id} onClick={() => setDraft({ ...draft, theme: theme.id })}><span className="theme-preview" style={{ background: theme.colors[1] }}><i style={{ background: theme.colors[0] }} /><i style={{ background: theme.colors[2] }} /><i style={{ background: theme.colors[0] }} /></span><b>{theme.name}</b><small>{theme.description}</small>{draft.theme === theme.id && <span className="selected-check"><Check /></span>}</button>)}</div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!draft.displayName.trim()} onClick={() => onSave({ ...draft, displayName: draft.displayName.trim() })}>Save changes</button></div></Modal>
}

function readSessionDraft<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { return JSON.parse(window.sessionStorage.getItem(key) ?? '') as T } catch { return fallback }
}

function clearSessionDraft(key: string) {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(key)
}

type ItemDraft = Pick<PlateItem, 'title' | 'category' | 'points' | 'loads' | 'status'> & { due: string; note: string }

function AddItemModal({ ownerId, onAdd, onClose }: { ownerId: string; onAdd: (item: PlateItem) => Promise<boolean>; onClose: () => void }) {
  const draftKey = `myplate-add-draft:${ownerId}`
  const initial = readSessionDraft<ItemDraft>(draftKey, { title: '', category: 'work', points: 15, loads: ['cognitive'], status: 'active', due: '', note: '' })
  const [title, setTitle] = useState(initial.title)
  const [category, setCategory] = useState<PlateItem['category']>(initial.category)
  const [points, setPoints] = useState(initial.points)
  const [loads, setLoads] = useState<PlateItem['loads']>(initial.loads)
  const [due, setDue] = useState(initial.due)
  const [note, setNote] = useState(initial.note)
  const [saving, setSaving] = useState(false)
  const loadOptions: PlateItem['loads'][number][] = ['cognitive', 'emotional', 'physical', 'sensory', 'social']
  const toggleLoad = (load: PlateItem['loads'][number]) => setLoads((current) => current.includes(load) ? current.filter((item) => item !== load) : [...current, load])
  useEffect(() => {
    window.sessionStorage.setItem(draftKey, JSON.stringify({ title, category, points, loads, status: 'active', due, note } satisfies ItemDraft))
  }, [draftKey, title, category, points, loads, due, note])
  function discard() { clearSessionDraft(draftKey); onClose() }
  async function save() {
    setSaving(true)
    const saved = await onAdd({ id: clientId(), ownerId, title: title.trim(), note: note.trim() || undefined, category, points, loads, status: 'active', due: due || undefined })
    if (saved) clearSessionDraft(draftKey)
    setSaving(false)
  }
  return <Modal title="Add a commitment" onClose={discard}><p className="eyebrow">PUT IT ON YOUR PLATE</p><h2>What are you carrying?</h2><p className="modal-intro">Capacity points describe how heavy something feels—not how important or difficult it “should” be.</p><label className="field-label">Commitment<input autoFocus value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} placeholder="Reply to emails, make dinner, rest…" /></label><div className="field-row"><label className="field-label">Category<select value={category} onChange={(event) => setCategory(event.target.value as PlateItem['category'])}>{['work','home','health','social','creative','waiting'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><label className="field-label">Due date<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label></div><label className="field-label">Private note<textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context that stays private…" /></label><label className="field-label points-field"><span>Capacity weight <b>{points} points</b></span><input type="range" min="5" max="50" step="5" value={points} onChange={(event) => setPoints(Number(event.target.value))} /></label><fieldset className="load-picker"><legend>What kind of load does it carry?</legend>{loadOptions.map((load) => <button type="button" className={loads.includes(load) ? 'selected' : ''} key={load} onClick={() => toggleLoad(load)}>{loadIcon(load)} {load}</button>)}</fieldset><div className="modal-footer end"><button className="secondary-button" onClick={discard}>Cancel</button><button className="primary-button" disabled={saving || !title.trim() || loads.length === 0} onClick={() => void save()}><Plus size={17} /> {saving ? 'Saving…' : 'Add to my plate'}</button></div></Modal>
}

function EditItemModal({ item, onSave, onDelete, onClose }: { item: PlateItem; onSave: (item: PlateItem) => Promise<boolean>; onDelete: () => void; onClose: () => void }) {
  const draftKey = `myplate-edit-draft:${item.id}`
  const initial = readSessionDraft<ItemDraft>(draftKey, { title: item.title, category: item.category, points: item.points, loads: item.loads, status: item.status, due: item.due ?? '', note: item.note ?? '' })
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const loadOptions: PlateItem['loads'][number][] = ['cognitive', 'emotional', 'physical', 'sensory', 'social']
  useEffect(() => { window.sessionStorage.setItem(draftKey, JSON.stringify(draft)) }, [draftKey, draft])
  function discard() { clearSessionDraft(draftKey); onClose() }
  async function save() {
    setSaving(true)
    const saved = await onSave({ ...item, ...draft, title: draft.title.trim(), note: draft.note.trim() || undefined, due: draft.due || undefined })
    if (saved) clearSessionDraft(draftKey)
    setSaving(false)
  }
  const toggleLoad = (load: PlateItem['loads'][number]) => setDraft((current) => ({ ...current, loads: current.loads.includes(load) ? current.loads.filter((value) => value !== load) : [...current.loads, load] }))
  return <Modal title="Edit commitment" onClose={discard}><p className="eyebrow">YOUR PLATE CAN CHANGE</p><h2>Edit this commitment.</h2><label className="field-label">Commitment<input autoFocus value={draft.title} maxLength={240} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><div className="field-row"><label className="field-label">Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as PlateItem['category'] })}>{['work','home','health','social','creative','waiting'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><label className="field-label">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlateItem['status'] })}><option value="active">On my plate</option><option value="side-plate">Side plate</option><option value="waiting">Waiting</option><option value="complete">Complete</option></select></label></div><label className="field-label">Due date<input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} /></label><label className="field-label">Private note<textarea rows={3} maxLength={2000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Optional context that stays private…" /></label><label className="field-label points-field"><span>Capacity weight <b>{draft.points} points</b></span><input type="range" min="5" max="50" step="5" value={draft.points} onChange={(event) => setDraft({ ...draft, points: Number(event.target.value) })} /></label><fieldset className="load-picker"><legend>What kind of load does it carry?</legend>{loadOptions.map((load) => <button type="button" className={draft.loads.includes(load) ? 'selected' : ''} key={load} onClick={() => toggleLoad(load)}>{loadIcon(load)} {load}</button>)}</fieldset><div className="modal-footer edit-footer"><button className="danger-button" onClick={onDelete}><Trash2 size={17} /> Delete</button><div><button className="secondary-button" onClick={discard}>Cancel</button><button className="primary-button" disabled={saving || !draft.title.trim() || draft.loads.length === 0} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button></div></div></Modal>
}

function DeleteItemModal({ item, onConfirm, onBack, onClose }: { item: PlateItem; onConfirm: () => void; onBack: () => void; onClose: () => void }) {
  return <Modal title="Delete commitment" onClose={onClose}><div className="delete-icon"><Trash2 /></div><p className="eyebrow">REMOVE FROM YOUR PLATE</p><h2>Delete “{item.title}”?</h2><p className="modal-intro">This removes the commitment from your private plate. This action cannot be undone.</p><div className="modal-footer end"><button className="secondary-button" onClick={onBack}>Keep it</button><button className="danger-button solid" onClick={onConfirm}><Trash2 size={17} /> Delete commitment</button></div></Modal>
}

function InviteModal({ circle, canJoin, onJoin, onClose }: { circle: CircleSummary | null; canJoin: boolean; onJoin: (code: string) => Promise<string | null>; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const code = circle?.inviteCode ?? 'Invite unavailable'
  async function copyCode() {
    if (!circle) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }
  async function join() {
    setJoining(true); setError('')
    const message = await onJoin(joinCode)
    if (message) setError(message)
    setJoining(false)
  }
  return <Modal title="Connect your table" onClose={onClose}><p className="eyebrow">BUILD YOUR TRUSTED CIRCLE</p><h2>Invite someone you trust.</h2><p className="modal-intro">They will never see your private plate. An invite only gives them a seat at your table so you can choose what to share later.</p><div className="invite-code"><span>{code}</span><button className="primary-button" disabled={!circle} onClick={copyCode}>{copied ? <><Check size={17} /> Copied</> : 'Copy invite code'}</button></div>{canJoin && <div className="join-panel"><div className="join-divider"><span>or join their table</span></div><label className="field-label">Invite code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Paste their code" autoCapitalize="none" /></label>{error && <p className="form-error">{error}</p>}<button className="secondary-button full" disabled={joining || joinCode.trim().length < 6} onClick={join}>{joining ? 'Joining…' : 'Join trusted circle'}</button></div>}<div className="safe-callout"><ShieldCheck /><span>Your commitments, check-ins, notes, and AI conversations remain private by default.</span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Done</button></div></Modal>
}

function CheckinModal({ value, onSave, onClose }: { value: CapacityCheckin; onSave: (value: CapacityCheckin) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const labels: [keyof CapacityCheckin, string, string][] = [['physical', 'Physical energy', 'How available does your body feel?'], ['cognitive', 'Cognitive clarity', 'How much focus is accessible?'], ['emotional', 'Emotional bandwidth', 'How much feeling can you hold?'], ['sensory', 'Sensory tolerance', 'How much input can you take in?'], ['social', 'Social capacity', 'How available are you to people?'], ['recovery', 'Recovery need', 'How much softness do you need afterward?']]
  return <Modal title="Capacity check-in" onClose={onClose}><p className="eyebrow">A MOMENT WITH YOURSELF</p><h2>What does today actually have available?</h2><p className="modal-intro">This is an editable planning estimate, not a health assessment.</p><div className="checkin-list">{labels.map(([key, label, help]) => <label key={key}><span><b>{label}</b><small>{help}</small></span><input type="range" min="1" max="5" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} /><strong>{draft[key]}/5</strong></label>)}</div><div className="capacity-preview"><Sparkles /><span><b>About {calculateCapacity(draft)} points available</b><small>You can edit this number after saving.</small></span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave(draft)}>Save today’s capacity</button></div></Modal>
}

function BrainDumpModal({ supabase, ownerId, onApply, onClose }: { supabase: SupabaseClient | null; ownerId: string; onApply: (items: PlateItem[]) => Promise<boolean>; onClose: () => void }) {
  const draftKey = `myplate-brain-draft:${ownerId}`
  const [text, setText] = useState(() => readSessionDraft(draftKey, ''))
  const [proposal, setProposal] = useState<AssistantProposal[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { window.sessionStorage.setItem(draftKey, JSON.stringify(text)) }, [draftKey, text])
  function discard() { clearSessionDraft(draftKey); onClose() }
  async function organize() {
    setLoading(true); setError('')
    const { data, error: assistantError } = await invokePlateAssistant(supabase, 'brain_dump', { text })
    const rows = (data as { proposals?: AssistantProposal[] } | null)?.proposals
    if (assistantError || !rows?.length) { setError('Plate Assistant is unavailable right now. Nothing was changed—try again or add items manually.'); setLoading(false); return }
    setProposal(rows)
    setSelected(new Set(rows.map((_, index) => index)))
    setLoading(false)
  }
  async function applyApproved() {
    setLoading(true)
    const saved = await onApply(approved.map((item) => ({ id: clientId(), ownerId, title: item.title, category: item.category, points: item.points, loads: item.loads, status: 'active' })))
    if (saved) clearSessionDraft(draftKey)
    setLoading(false)
  }
  const approved = proposal.filter((_, index) => selected.has(index))
  return <Modal title="Brain dump" onClose={discard} wide><p className="eyebrow">MESSY IS WELCOME</p><h2>Put everything on the table.</h2><p className="modal-intro">AI organizes a review-only proposal. Nothing touches your plate until you approve it.</p>{proposal.length === 0 ? <><textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="I need to finish the deck, pick up groceries, call my doctor, and I promised I’d check on my friend…" />{error && <p className="form-error ai-error">{error}</p>}<div className="safe-callout"><ShieldCheck /><span>Your draft stays in this browser tab until you submit or cancel. Only this message is used for the AI request, and model storage is disabled.</span></div><div className="modal-footer end"><button className="secondary-button" onClick={discard}>Cancel</button><button className="primary-button" disabled={loading || text.trim().length < 5} onClick={organize}><WandSparkles size={17} /> {loading ? 'Organizing privately…' : 'Organize my thoughts'}</button></div></> : <><div className="review-banner"><ShieldCheck /><span><b>Review before adding</b> Uncheck anything that does not feel right. AI estimates are editable planning suggestions—not facts.</span></div><div className="proposal-list">{proposal.map((item, index) => <label key={`${item.title}-${index}`}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next })} /><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.category} · {item.points} points · {item.loads.join(' + ')}</small><small>{item.reason}</small></div><em>AI proposal</em></label>)}</div><div className="modal-footer end"><button className="secondary-button" onClick={() => setProposal([])}>Back</button><button className="primary-button" disabled={loading || !approved.length} onClick={() => void applyApproved()}><Check size={17} /> {loading ? 'Adding…' : `Add ${approved.length} approved ${approved.length === 1 ? 'item' : 'items'}`}</button></div></>}</Modal>
}

function RoomModal({ supabase, used, capacity, items, quickSuggestions, canUseAi, onApply, onClose }: { supabase: SupabaseClient | null; used: number; capacity: number; items: PlateItem[]; quickSuggestions: ReturnType<typeof suggestRoom>; canUseAi: boolean; onApply: (action: string, itemId: string) => void; onClose: () => void }) {
  const [aiSuggestions, setAiSuggestions] = useState<AssistantProposal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function askAi() {
    setLoading(true); setError('')
    const safeItems = items.filter((item) => item.status === 'active').map(({ id, title, category, points, loads, status }) => ({ id, title, category, points, loads, status }))
    const { data, error: assistantError } = await invokePlateAssistant(supabase, 'make_room', { capacity, used, items: safeItems })
    const rows = (data as { proposals?: AssistantProposal[] } | null)?.proposals?.filter((row) => row.action && row.sourceItemId && safeItems.some((item) => item.id === row.sourceItemId))
    if (assistantError || !rows?.length) setError('Plate Assistant is unavailable right now. Your quick options still work, and nothing was changed.')
    else setAiSuggestions(rows)
    setLoading(false)
  }
  const suggestions = aiSuggestions.length ? aiSuggestions.map((row, index) => ({ id: `ai-${index}`, itemId: row.sourceItemId!, title: row.title, detail: `${row.reason}${row.nextStep ? ` ${row.nextStep}` : ''}`, action: row.action! })) : quickSuggestions
  return <Modal title="Make Room Plus" onClose={onClose} wide><p className="eyebrow">OPTIONS, NOT ORDERS</p><h2>Let’s make this plan fit your actual life.</h2><p className="modal-intro">You have {used} points committed and about {capacity} available. Choose one strategy to approve—MyPlate+ will never change your commitments automatically.</p><div className="room-summary"><span>{used - capacity > 0 ? `${used - capacity} points over` : 'Your plate fits'}</span><div><i style={{ width: `${used ? Math.min(100, (capacity / used) * 100) : 100}%` }} /></div></div>{canUseAi && <div className="ai-action-row"><div><b>{aiSuggestions.length ? 'Plate Assistant suggestions' : 'Want personalized options?'}</b><span>Only active item titles, loads, and points are sent. Private notes stay here.</span></div><button className="secondary-button" disabled={loading || !items.length} onClick={askAi}><WandSparkles size={16} /> {loading ? 'Thinking…' : aiSuggestions.length ? 'Refresh AI ideas' : 'Ask Plate Assistant'}</button></div>}{error && <p className="form-error ai-error">{error}</p>}<div className="suggestion-grid">{suggestions.length ? suggestions.map((suggestion) => <article key={suggestion.id}><span className="suggestion-icon">{suggestion.action === 'pass' ? <HeartHandshake /> : suggestion.action === 'split' ? <Sparkles /> : <Clock3 />}</span><h3>{suggestion.title}</h3><p>{suggestion.detail}</p><button className="secondary-button full" onClick={() => onApply(suggestion.action, suggestion.itemId)}>Approve this option <ArrowRight size={16} /></button></article>) : <div className="all-good"><Check /><h3>Your plate fits.</h3><p>You can still protect recovery time or move something intentionally.</p></div>}</div><p className="ai-disclaimer"><ShieldCheck size={15} /> {aiSuggestions.length ? 'AI suggestions shown above require your approval.' : 'Quick options are calculated on your device.'} Neither is medical advice.</p></Modal>
}

function PassModal({ item, members, onInvite, onSend, onClose }: { item: PlateItem; members: CircleMember[]; onInvite: () => void; onSend: (kind: RequestKind, recipientId?: string, note?: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<RequestKind>('take-it')
  const [recipient, setRecipient] = useState<string>(members[0]?.id ?? '')
  const [note, setNote] = useState('')
  return <Modal title="Pass the Plate" onClose={onClose}><p className="eyebrow">SHARE THE REQUEST, NOT YOUR PRIVATE PLATE</p><h2>How would support help?</h2><div className="passing-item"><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.points} capacity points</small></div></div>{members.length === 0 ? <div className="empty-request"><Users /><b>Your table needs one more person.</b><span>Invite someone or join their circle before sending a support request.</span><button className="primary-button" onClick={onInvite}>Connect my table</button></div> : <><div className="support-types">{(Object.keys(requestLabels) as RequestKind[]).map((key) => <button className={kind === key ? 'selected' : ''} onClick={() => setKind(key)} key={key}>{requestLabels[key]}</button>)}</div><label className="field-label">Ask someone<select value={recipient} onChange={(e) => setRecipient(e.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.displayName} · {member.sharedStatus}</option>)}<option value="">Anyone at the table</option></select></label><label className="field-label">Optional public note<textarea rows={3} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Could you take this, help me start, or sit with me while I do it?" /></label><div className="share-receipt"><LockKeyhole /><div><b>They will see</b><span>“{item.title}” · {requestLabels[kind]} · {item.points} points{note ? ' · your note' : ''}</span><b>They will not see</b><span>Your check-in, private notes, other commitments, or AI conversation.</span></div></div></>}<div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button>{members.length > 0 && <button className="primary-button" onClick={() => onSend(kind, recipient || undefined, note)}><HandHeart size={17} /> Send support request</button>}</div></Modal>
}
