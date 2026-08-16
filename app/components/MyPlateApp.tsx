'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Bell, Brain, Check, ChevronRight, CircleUserRound, Clock3,
  HandHeart, HeartHandshake, Inbox, Lightbulb, LockKeyhole, LogOut, Menu,
  Plus, RefreshCcw, Settings, ShieldCheck, Sparkles, Users, WandSparkles, X,
} from 'lucide-react'
import { AuthGate } from './AuthGate'
import { demoCircle, defaultCheckin, demoItems, demoProfile, demoRequests } from '../lib/demo'
import { activePoints, calculateCapacity, capacityLabel, loadIcon, requestLabels, suggestRoom, themes } from '../lib/model'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CapacityCheckin, PassRequest, PlateItem, Profile, RequestKind, ThemeId } from '../types'

type View = 'plate' | 'table' | 'requests' | 'insights' | 'privacy'
type AppMode = 'loading' | 'signed-out' | 'demo' | 'account'
type CircleSummary = { id: string; name: string; inviteCode: string }

const categoryColor: Record<string, string> = {
  work: 'var(--work)', home: 'var(--home)', health: 'var(--health)', social: 'var(--social)', creative: 'var(--creative)', waiting: 'var(--waiting)',
}

function clientId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function App() {
  const [mode, setMode] = useState<AppMode>(supabase ? 'loading' : 'signed-out')
  const [userId, setUserId] = useState<string | null>(null)
  const [view, setView] = useState<View>('plate')
  const [profile, setProfile] = useState<Profile>({ id: '', displayName: 'My Plate', initials: 'MP', theme: 'botanical', sharedStatus: 'limited' })
  const [items, setItems] = useState<PlateItem[]>([])
  const [requests, setRequests] = useState<PassRequest[]>([])
  const [checkin, setCheckin] = useState<CapacityCheckin>(defaultCheckin)
  const [circle, setCircle] = useState<CircleSummary | null>(null)
  const [modal, setModal] = useState<'none' | 'setup' | 'profile' | 'checkin' | 'brain' | 'room' | 'pass' | 'add' | 'invite'>('none')
  const [selectedItem, setSelectedItem] = useState<PlateItem | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [notice, setNotice] = useState('')

  const capacity = calculateCapacity(checkin)
  const used = activePoints(items)
  const percent = Math.round((used / capacity) * 100)
  const fullness = capacityLabel(percent)
  const suggestions = useMemo(() => suggestRoom(items, capacity), [items, capacity])

  async function loadAccount(id: string, email?: string) {
    if (!supabase) return
    setMode('loading')
    setUserId(id)
    const [profileResult, itemsResult, checkinResult, requestsResult, circleResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, theme, shared_status').eq('id', id).single(),
      supabase.from('plate_items').select('id, owner_id, title, private_note, category, points, loads, status, due_on').eq('owner_id', id).order('created_at', { ascending: false }),
      supabase.from('capacity_checkins').select('physical, cognitive, emotional, sensory, social, recovery').eq('user_id', id).order('checked_in_on', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('pass_requests').select('id, sender_id, recipient_id, public_title, public_note, kind, status, points, created_at').order('created_at', { ascending: false }),
      supabase.from('circles').select('id, name, invite_code').eq('owner_id', id).limit(1).maybeSingle(),
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
    setRequests((requestsResult.data ?? []).map((request) => ({
      id: request.id, senderId: request.sender_id, recipientId: request.recipient_id ?? undefined,
      publicTitle: request.public_title, note: request.public_note, kind: request.kind,
      status: request.status, points: request.points,
      createdAt: new Date(request.created_at).toLocaleDateString(),
    })) as PassRequest[])
    if (latest) setCheckin(latest)
    setCircle(circleResult.data ? { id: circleResult.data.id, name: circleResult.data.name, inviteCode: circleResult.data.invite_code } : null)
    setMode('account')
    if (!latest && nextItems.length === 0) setModal('setup')
  }

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void loadAccount(data.session.user.id, data.session.user.email)
      else setMode('signed-out')
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) void loadAccount(session.user.id, session.user.email)
      if (event === 'SIGNED_OUT') { setUserId(null); setMode('signed-out') }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  function enterDemo() {
    setMode('demo')
    setProfile({ ...demoProfile, theme: (localStorage.getItem('myplate-theme') as ThemeId) || demoProfile.theme })
    setItems(demoItems)
    setRequests(demoRequests)
    setCheckin(defaultCheckin)
    setCircle({ id: demoCircle.id, name: demoCircle.name, inviteCode: 'DEMO-PLUS' })
  }

  function exitDemo() {
    setItems([]); setRequests([]); setCircle(null); setMode('signed-out'); setView('plate')
  }

  if (mode === 'loading') return <main className="loading-shell"><div className="loading-plate"><Sparkles /><b>Setting your table…</b><span>Loading your private plate</span></div></main>
  if (mode === 'signed-out') return <AuthGate onDemo={enterDemo} />

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
      const { error } = await supabase.from('capacity_checkins').upsert({ user_id: userId, ...next, available_points: calculateCapacity(next), checked_in_on: new Date().toISOString().slice(0, 10) }, { onConflict: 'user_id,checked_in_on' })
      if (error) setNotice('Your check-in is visible here, but it could not be saved.')
    }
    setModal('none')
  }

  async function addItem(item: PlateItem) {
    if (mode === 'demo' || !supabase || !userId) { setItems((current) => [item, ...current]); setModal('none'); return }
    const { data, error } = await supabase.from('plate_items').insert({ owner_id: userId, title: item.title, private_note: item.note ?? null, category: item.category, points: item.points, loads: item.loads, status: item.status, due_on: item.due || null }).select('id').single()
    if (error) { setNotice('That commitment could not be saved. Please try again.'); return }
    setItems((current) => [{ ...item, id: data.id, ownerId: userId }, ...current])
    setModal('none')
  }

  async function applyBrainDump(newItems: PlateItem[]) {
    if (mode === 'demo' || !supabase || !userId) { setItems((current) => [...newItems, ...current]); setModal('none'); return }
    const rows = newItems.map((item) => ({ owner_id: userId, title: item.title, category: item.category, points: item.points, loads: item.loads, status: item.status }))
    const { data, error } = await supabase.from('plate_items').insert(rows).select('id, owner_id, title, category, points, loads, status')
    if (error) { setNotice('Your ideas stayed private, but they could not be added yet.'); return }
    setItems((current) => ([...(data ?? []).map((item) => ({ id: item.id, ownerId: item.owner_id, title: item.title, category: item.category, points: item.points, loads: item.loads, status: item.status } as PlateItem)), ...current]))
    setModal('none')
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

  function sendPass(kind: RequestKind, recipientId?: string) {
    if (!selectedItem) return
    setRequests((current) => [{
      id: clientId(), senderId: profile.id, recipientId, publicTitle: selectedItem.title,
      kind, status: 'open', points: selectedItem.points, note: 'I chose to share only this request—not the rest of my plate.', createdAt: 'Just now',
    }, ...current])
    setItems((current) => current.map((item) => item.id === selectedItem.id ? { ...item, status: 'waiting' } : item))
    setSelectedItem(null)
    setModal('none')
    setView('requests')
  }

  return (
    <div className={`app theme-${profile.theme}`}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
        <a className="brand" href="#top" onClick={() => setView('plate')}><span className="brand-mark">+</span><span>MyPlate<b>+</b></span></a>
        <div className="top-actions">
          {mode === 'demo' ? <button className="demo-chip demo-exit" onClick={exitDemo}>Demo mode · Exit</button> : <span className="demo-chip"><LockKeyhole size={13} /> Private account</span>}
          <button className="icon-button" aria-label="Notifications"><Bell /></button>
          <button className="avatar-button" aria-label="Open profile" onClick={() => setModal('profile')}><span>{profile.initials}</span></button>
        </div>
      </header>

      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <button className="close-mobile mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
        <nav aria-label="Primary navigation">
          <NavButton active={view === 'plate'} icon={<CircleUserRound />} label="My Plate" onClick={() => { setView('plate'); setMobileNav(false) }} />
          <NavButton active={view === 'table'} icon={<Users />} label="Our Table" onClick={() => { setView('table'); setMobileNav(false) }} />
          <NavButton active={view === 'requests'} icon={<Inbox />} label="Passed to Me" badge={requests.filter((r) => r.status === 'open').length} onClick={() => { setView('requests'); setMobileNav(false) }} />
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
        {view === 'plate' && <PlateView name={profile.displayName} items={items} capacity={capacity} used={used} percent={percent} fullness={fullness} onCheckin={() => setModal('checkin')} onBrain={() => setModal('brain')} onAdd={() => setModal('add')} onRoom={() => setModal('room')} onPass={(item) => { setSelectedItem(item); setModal(mode === 'demo' ? 'pass' : 'invite') }} />}
        {view === 'table' && <TableView isDemo={mode === 'demo'} profile={profile} circle={circle} onInvite={() => setModal('invite')} onRequest={() => { const item = items.find((i) => i.status === 'active'); if (item) { setSelectedItem(item); setModal(mode === 'demo' ? 'pass' : 'invite') } else setModal('add') }} />}
        {view === 'requests' && <RequestsView requests={requests} setRequests={setRequests} />}
        {view === 'insights' && <InsightsView hasData={mode === 'demo' || items.length > 0} />}
        {view === 'privacy' && <PrivacyView />}
      </main>

      {modal === 'setup' && <SetupModal profile={profile} checkin={checkin} onSave={async (nextProfile, nextCheckin) => { await saveProfile(nextProfile); await saveCheckin(nextCheckin); setModal('add') }} />}
      {modal === 'profile' && <ProfileModal profile={profile} onSave={saveProfile} onClose={() => setModal('none')} />}
      {modal === 'checkin' && <CheckinModal value={checkin} onSave={saveCheckin} onClose={() => setModal('none')} />}
      {modal === 'brain' && <BrainDumpModal ownerId={profile.id} onApply={applyBrainDump} onClose={() => setModal('none')} />}
      {modal === 'add' && <AddItemModal ownerId={profile.id} onAdd={addItem} onClose={() => setModal('none')} />}
      {modal === 'invite' && <InviteModal circle={circle} onClose={() => { setSelectedItem(null); setModal('none') }} />}
      {modal === 'room' && <RoomModal used={used} capacity={capacity} suggestions={suggestions} onApply={applyRoom} onClose={() => setModal('none')} />}
      {modal === 'pass' && selectedItem && <PassModal item={selectedItem} onSend={sendPass} onClose={() => { setSelectedItem(null); setModal('none') }} />}
    </div>
  )
}

function initialsFor(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MP'
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b className="nav-badge">{badge}</b> : null}</button>
}

function PlateView({ name, items, capacity, used, percent, fullness, onCheckin, onBrain, onAdd, onRoom, onPass }: {
  name: string; items: PlateItem[]; capacity: number; used: number; percent: number; fullness: { label: string; message: string };
  onCheckin: () => void; onBrain: () => void; onAdd: () => void; onRoom: () => void; onPass: (item: PlateItem) => void
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
              {active.map((item, index) => <button key={item.id} className={`plate-object object-${index % 6}`} style={{ '--object-size': `${Math.max(70, item.points * 3.4)}px`, '--object-color': categoryColor[item.category] } as React.CSSProperties} onClick={() => onPass(item)} aria-label={`${item.title}, ${item.points} capacity points`}><strong>{item.title}</strong><small>{item.points} pts</small><span>{item.loads.map(loadIcon).join(' ')}</span></button>)}
              {active.length === 0 && <div className="empty-plate"><Sparkles /><b>Your plate is ready.</b><span>Add what you’re carrying—big, small, visible, or invisible.</span><button className="primary-button" onClick={onAdd}><Plus size={17} /> Add your first commitment</button></div>}
            </div>
          </div>
        </div>
        <div className="load-key"><span>◎ Cognitive</span><span>♥ Emotional</span><span>↟ Physical</span><span>✦ Sensory</span><span>◌ Social</span></div>
      </article>
      <aside className="today-card">
        <div className="section-title"><div><p className="eyebrow">TODAY’S PLAN</p><h2>Commitments</h2></div><button className="small-add" aria-label="Add commitment" onClick={onAdd}><Plus /></button></div>
        <div className="item-list">{active.map((item) => <div className="item-row" key={item.id}><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.category} · {item.points} pts {item.due ? `· ${item.due}` : ''}</small></div><button className="icon-button subtle" onClick={() => onPass(item)} aria-label={`Pass ${item.title}`}><HandHeart /></button></div>)}</div>
        {active.length === 0 && <div className="empty-list"><p>Nothing has been added yet.</p><button className="secondary-button full" onClick={onAdd}><Plus size={17} /> Add a commitment</button></div>}
        {side.length > 0 && <div className="side-plate"><span><Clock3 size={17} /> Side plate</span>{side.map((item) => <small key={item.id}>{item.title}</small>)}</div>}
      </aside>
    </section>
  </>
}

function TableView({ isDemo, profile, circle, onInvite, onRequest }: { isDemo: boolean; profile: Profile; circle: CircleSummary | null; onInvite: () => void; onRequest: () => void }) {
  const members = isDemo ? demoCircle.members : [{ ...profile, role: 'owner' as const, capacityPercent: 0 }]
  return <>
    <section className="page-heading"><div><p className="eyebrow">YOUR TRUSTED CIRCLE</p><h1>Our Table</h1><p>Shared care without shared surveillance.</p></div><button className="primary-button" onClick={onRequest}><HandHeart size={18} /> Ask for support</button></section>
    <div className="table-hero">
      <div><span className="status-dot open" /> <b>{circle?.name ?? 'My Trusted Circle'}</b><small>{members.length} {members.length === 1 ? 'person' : 'people'} · private circle</small></div>
      <button className="secondary-button" onClick={onInvite}><Plus size={17} /> Invite someone</button>
    </div>
    <section className="member-grid">
      {members.map((member) => <article className="member-card" key={member.id}><div className="member-top"><span className={`member-avatar member-${member.theme}`}>{member.initials}</span><div><h3>{member.displayName}{member.id === profile.id ? ' · You' : ''}</h3><p><span className={`status-dot ${member.sharedStatus}`} /> {member.sharedStatus}</p></div></div><div className="shared-meter"><span style={{ width: `${Math.min(member.capacityPercent, 100)}%` }} /></div><p className="member-summary">{member.id === profile.id ? 'Your private plate stays private. You choose what to pass.' : member.sharedStatus === 'open' ? 'Open to support requests today.' : 'Protecting recovery time.'}</p></article>)}
      {!isDemo && <button className="member-card add-member-card" onClick={onInvite}><Plus /><b>Invite your first person</b><span>Bring family, a partner, or a trusted friend to the table.</span></button>}
    </section>
    <section className="shared-board"><div className="section-title"><div><p className="eyebrow">SHARED DISHES</p><h2>What we’re carrying together</h2></div></div>{isDemo ? <div className="shared-items"><div><span className="shared-icon">⌂</span><b>Plan Sunday dinner</b><small>Maria + Jasmine · shared</small></div><div><span className="shared-icon">✦</span><b>Prepare for family visit</b><small>3 contributors · 2 steps left</small></div><div className="empty-shared"><Plus /><span>Add a shared responsibility</span></div></div> : <div className="empty-shared-state"><HeartHandshake /><h3>Your shared table starts with trust.</h3><p>Invite someone before adding responsibilities or passing a plate.</p><button className="primary-button" onClick={onInvite}>Invite someone</button></div>}</section>
  </>
}

function RequestsView({ requests, setRequests }: { requests: PassRequest[]; setRequests: React.Dispatch<React.SetStateAction<PassRequest[]>> }) {
  const open = requests.filter((r) => r.status === 'open')
  const history = requests.filter((r) => r.status !== 'open')
  const update = (id: string, status: PassRequest['status']) => setRequests((current) => current.map((r) => r.id === id ? { ...r, status } : r))
  return <>
    <section className="page-heading"><div><p className="eyebrow">SUPPORT, WITH CONSENT</p><h1>Passed to Me</h1><p>Accept what fits. Declining is always allowed.</p></div></section>
    <section className="request-layout"><div><h2>Waiting for you <span>{open.length}</span></h2>{open.map((request) => <article className="request-card" key={request.id}><div className="request-meta"><span className="member-avatar member-bloom">MS</span><span><b>Maria asked to {requestLabels[request.kind].toLowerCase()}</b><small>{request.createdAt}</small></span></div><h3>{request.publicTitle}</h3><p>{request.note}</p><div className="request-impact"><span>{request.points} pts</span><span>Only this request was shared</span></div><div className="request-actions"><button className="secondary-button" onClick={() => update(request.id, 'declined')}>Not today</button><button className="primary-button" onClick={() => update(request.id, 'accepted')}><Check size={17} /> Accept</button></div></article>)}</div><aside><h2>Recent</h2>{history.map((request) => <div className="history-row" key={request.id}><span className={`history-icon ${request.status}`}><Check /></span><div><b>{request.publicTitle}</b><small>{requestLabels[request.kind]} · {request.status}</small></div></div>)}</aside></section>
  </>
}

function InsightsView({ hasData }: { hasData: boolean }) {
  if (!hasData) return <><section className="page-heading"><div><p className="eyebrow">PRIVATE PATTERNS</p><h1>What your capacity is teaching you</h1><p>Observations—not diagnoses, predictions, or judgments.</p></div></section><section className="empty-insights"><Lightbulb /><h2>Your insights will grow with you.</h2><p>Complete check-ins and add commitments. MyPlate+ will look for gentle patterns without grading your productivity.</p></section></>
  return <><section className="page-heading"><div><p className="eyebrow">PRIVATE PATTERNS</p><h1>What your capacity is teaching you</h1><p>Observations—not diagnoses, predictions, or judgments.</p></div><button className="secondary-button"><RefreshCcw size={17} /> This month</button></section><section className="insight-grid"><article className="hero-insight"><span className="insight-symbol">◎</span><p className="eyebrow">A PATTERN WORTH NOTICING</p><h2>Cognitive work has needed more recovery than you estimated.</h2><p>On three of the last four high-focus days, you lowered your next-day capacity. Consider protecting a softer landing after deep work.</p><button className="text-link">See the evidence <ArrowRight size={16} /></button></article><article><p className="eyebrow">MOST UNDERESTIMATED</p><h3>Coordination</h3><strong>+8 pts</strong><p>Tasks involving other people felt heavier than planned.</p></article><article><p className="eyebrow">WHAT HELPED</p><h3>Doing it together</h3><strong>4 times</strong><p>This was your most accepted kind of support.</p></article><article><p className="eyebrow">CAPACITY RANGE</p><h3>48–86 pts</h3><div className="mini-chart"><i /><i /><i /><i /><i /><i /><i /></div><p>Your capacity changed. Your worth did not.</p></article></section></>
}

function PrivacyView() {
  return <><section className="page-heading"><div><p className="eyebrow">RESPONSIBLE BY DESIGN</p><h1>AI & Privacy Center</h1><p>You should never have to guess what the system knows or shares.</p></div></section><section className="privacy-grid"><article className="privacy-hero"><ShieldCheck /><div><p className="eyebrow">YOUR PLATE IS PRIVATE</p><h2>Nothing is shared until you choose it.</h2><p>Your circle cannot see your brain dumps, private commitments, check-ins, notes, or AI conversations. Pass the Plate creates a new, limited request containing only the fields you approve.</p></div></article>{[
    ['AI suggestions require approval', 'MyPlate+ can propose. Only you can apply, send, move, split, or pass.'],
    ['No diagnosis or productivity scoring', 'Capacity estimates are editable planning tools—not medical conclusions or judgments of worth.'],
    ['Minimum necessary context', 'The assistant receives only the information required for the request. Model storage is disabled.'],
    ['Control that follows the data', 'Export your information, revoke circle access, inspect sharing history, or permanently delete your account.'],
  ].map(([title, body], index) => <article className="privacy-item" key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</section><section className="data-controls"><div><LockKeyhole /><span><b>Data controls</b><small>Export, sharing history, and deletion</small></span></div><button className="secondary-button">Open controls <ChevronRight size={17} /></button></section></>
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

function AddItemModal({ ownerId, onAdd, onClose }: { ownerId: string; onAdd: (item: PlateItem) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<PlateItem['category']>('work')
  const [points, setPoints] = useState(15)
  const [loads, setLoads] = useState<PlateItem['loads']>(['cognitive'])
  const [due, setDue] = useState('')
  const loadOptions: PlateItem['loads'][number][] = ['cognitive', 'emotional', 'physical', 'sensory', 'social']
  const toggleLoad = (load: PlateItem['loads'][number]) => setLoads((current) => current.includes(load) ? current.filter((item) => item !== load) : [...current, load])
  return <Modal title="Add a commitment" onClose={onClose}><p className="eyebrow">PUT IT ON YOUR PLATE</p><h2>What are you carrying?</h2><p className="modal-intro">Capacity points describe how heavy something feels—not how important or difficult it “should” be.</p><label className="field-label">Commitment<input autoFocus value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} placeholder="Reply to emails, make dinner, rest…" /></label><div className="field-row"><label className="field-label">Category<select value={category} onChange={(event) => setCategory(event.target.value as PlateItem['category'])}>{['work','home','health','social','creative','waiting'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><label className="field-label">Due date<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label></div><label className="field-label points-field"><span>Capacity weight <b>{points} points</b></span><input type="range" min="5" max="50" step="5" value={points} onChange={(event) => setPoints(Number(event.target.value))} /></label><fieldset className="load-picker"><legend>What kind of load does it carry?</legend>{loadOptions.map((load) => <button type="button" className={loads.includes(load) ? 'selected' : ''} key={load} onClick={() => toggleLoad(load)}>{loadIcon(load)} {load}</button>)}</fieldset><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || loads.length === 0} onClick={() => onAdd({ id: clientId(), ownerId, title: title.trim(), category, points, loads, status: 'active', due: due || undefined })}><Plus size={17} /> Add to my plate</button></div></Modal>
}

function InviteModal({ circle, onClose }: { circle: CircleSummary | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const code = circle?.inviteCode ?? 'Invite unavailable'
  async function copyCode() {
    if (!circle) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }
  return <Modal title="Invite to your table" onClose={onClose}><p className="eyebrow">BUILD YOUR TRUSTED CIRCLE</p><h2>Invite someone you trust.</h2><p className="modal-intro">They will never see your private plate. An invite only gives them a seat at your table so you can choose what to share later.</p><div className="invite-code"><span>{code}</span><button className="primary-button" disabled={!circle} onClick={copyCode}>{copied ? <><Check size={17} /> Copied</> : 'Copy invite code'}</button></div><div className="safe-callout"><ShieldCheck /><span>Your commitments, check-ins, notes, and AI conversations remain private by default.</span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Done</button></div></Modal>
}

function CheckinModal({ value, onSave, onClose }: { value: CapacityCheckin; onSave: (value: CapacityCheckin) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const labels: [keyof CapacityCheckin, string, string][] = [['physical', 'Physical energy', 'How available does your body feel?'], ['cognitive', 'Cognitive clarity', 'How much focus is accessible?'], ['emotional', 'Emotional bandwidth', 'How much feeling can you hold?'], ['sensory', 'Sensory tolerance', 'How much input can you take in?'], ['social', 'Social capacity', 'How available are you to people?'], ['recovery', 'Recovery need', 'How much softness do you need afterward?']]
  return <Modal title="Capacity check-in" onClose={onClose}><p className="eyebrow">A MOMENT WITH YOURSELF</p><h2>What does today actually have available?</h2><p className="modal-intro">This is an editable planning estimate, not a health assessment.</p><div className="checkin-list">{labels.map(([key, label, help]) => <label key={key}><span><b>{label}</b><small>{help}</small></span><input type="range" min="1" max="5" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} /><strong>{draft[key]}/5</strong></label>)}</div><div className="capacity-preview"><Sparkles /><span><b>About {calculateCapacity(draft)} points available</b><small>You can edit this number after saving.</small></span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave(draft)}>Save today’s capacity</button></div></Modal>
}

function BrainDumpModal({ ownerId, onApply, onClose }: { ownerId: string; onApply: (items: PlateItem[]) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<PlateItem[]>([])
  function organize() {
    const pieces = text.split(/\n|,|\band\b/i).map((part) => part.trim()).filter((part) => part.length > 2).slice(0, 6)
    const categories = ['work', 'home', 'health', 'social', 'creative'] as const
    setProposal(pieces.map((title, index) => ({ id: clientId(), title: title.replace(/^i (need|have) to /i, ''), category: categories[index % categories.length], points: [10, 15, 20, 25][index % 4], loads: index % 2 ? ['cognitive', 'social'] : ['cognitive'], status: 'active', ownerId })))
  }
  return <Modal title="Brain dump" onClose={onClose} wide><p className="eyebrow">MESSY IS WELCOME</p><h2>Put everything on the table.</h2><p className="modal-intro">AI organizes a review-only proposal. Nothing touches your plate until you approve it.</p>{proposal.length === 0 ? <><textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="I need to finish the deck, pick up groceries, call my doctor, and I promised I’d check on my friend…" /><div className="safe-callout"><ShieldCheck /><span>Only this message is used for this request. It is never shared with your circle.</span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={text.trim().length < 5} onClick={organize}><WandSparkles size={17} /> Organize my thoughts</button></div></> : <><div className="proposal-list">{proposal.map((item) => <label key={item.id}><input type="checkbox" defaultChecked /><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.category} · {item.points} points · {item.loads.join(' + ')}</small></div><em>AI proposal</em></label>)}</div><div className="modal-footer end"><button className="secondary-button" onClick={() => setProposal([])}>Back</button><button className="primary-button" onClick={() => onApply(proposal)}><Check size={17} /> Add {proposal.length} approved items</button></div></>}</Modal>
}

function RoomModal({ used, capacity, suggestions, onApply, onClose }: { used: number; capacity: number; suggestions: ReturnType<typeof suggestRoom>; onApply: (action: string, itemId: string) => void; onClose: () => void }) {
  return <Modal title="Make Room Plus" onClose={onClose} wide><p className="eyebrow">OPTIONS, NOT ORDERS</p><h2>Let’s make this plan fit your actual life.</h2><p className="modal-intro">You have {used} points committed and about {capacity} available. Choose one strategy to preview—MyPlate+ will never change your commitments automatically.</p><div className="room-summary"><span>{used - capacity > 0 ? `${used - capacity} points over` : 'Your plate fits'}</span><div><i style={{ width: `${Math.min(100, (capacity / used) * 100)}%` }} /></div></div><div className="suggestion-grid">{suggestions.length ? suggestions.map((suggestion) => <article key={suggestion.id}><span className="suggestion-icon">{suggestion.action === 'pass' ? <HeartHandshake /> : suggestion.action === 'split' ? <Sparkles /> : <Clock3 />}</span><h3>{suggestion.title}</h3><p>{suggestion.detail}</p><button className="secondary-button full" onClick={() => onApply(suggestion.action, suggestion.itemId)}>Choose this option <ArrowRight size={16} /></button></article>) : <div className="all-good"><Check /><h3>Your plate fits.</h3><p>You can still protect recovery time or move something intentionally.</p></div>}</div><p className="ai-disclaimer"><ShieldCheck size={15} /> Suggestions are based on your approved plate data. They are not medical advice.</p></Modal>
}

function PassModal({ item, onSend, onClose }: { item: PlateItem; onSend: (kind: RequestKind, recipientId?: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<RequestKind>('take-it')
  const [recipient, setRecipient] = useState<string>('maria')
  return <Modal title="Pass the Plate" onClose={onClose}><p className="eyebrow">SHARE THE REQUEST, NOT YOUR PRIVATE PLATE</p><h2>How would support help?</h2><div className="passing-item"><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.points} capacity points</small></div></div><div className="support-types">{(Object.keys(requestLabels) as RequestKind[]).map((key) => <button className={kind === key ? 'selected' : ''} onClick={() => setKind(key)} key={key}>{requestLabels[key]}</button>)}</div><label className="field-label">Ask someone<select value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="maria">Maria · open</option><option value="devon">Devon · recovering</option><option value="">Anyone at the table</option></select></label><div className="share-receipt"><LockKeyhole /><div><b>They will see</b><span>“{item.title}” · {requestLabels[kind]} · {item.points} points</span><b>They will not see</b><span>Your check-in, private notes, other commitments, or AI conversation.</span></div></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSend(kind, recipient || undefined)}><HandHeart size={17} /> Send support request</button></div></Modal>
}
