import { useMemo, useState } from 'react'
import {
  Accessibility, ArrowRight, Bell, Brain, Check, ChevronRight, CircleUserRound, Clock3,
  HandHeart, HeartHandshake, Home, Inbox, Lightbulb, LockKeyhole, LogOut, Menu, Palette,
  Plus, RefreshCcw, Settings, ShieldCheck, Sparkles, Users, WandSparkles, X,
} from 'lucide-react'
import { AuthGate } from './components/AuthGate'
import { demoCircle, defaultCheckin, demoItems, demoProfile, demoRequests } from './lib/demo'
import { activePoints, calculateCapacity, capacityLabel, loadIcon, requestLabels, suggestRoom, themes } from './lib/model'
import { isSupabaseConfigured } from './lib/supabase'
import type { CapacityCheckin, PassRequest, PlateItem, Profile, RequestKind, ThemeId } from './types'

type View = 'plate' | 'table' | 'requests' | 'insights' | 'privacy'

const categoryColor: Record<string, string> = {
  work: 'var(--work)', home: 'var(--home)', health: 'var(--health)', social: 'var(--social)', creative: 'var(--creative)', waiting: 'var(--waiting)',
}

export default function App() {
  const [entered, setEntered] = useState(!isSupabaseConfigured)
  const [view, setView] = useState<View>('plate')
  const [profile, setProfile] = useState<Profile>(() => ({ ...demoProfile, theme: (localStorage.getItem('myplate-theme') as ThemeId) || 'botanical' }))
  const [items, setItems] = useState<PlateItem[]>(demoItems)
  const [requests, setRequests] = useState<PassRequest[]>(demoRequests)
  const [checkin, setCheckin] = useState<CapacityCheckin>(defaultCheckin)
  const [modal, setModal] = useState<'none' | 'theme' | 'checkin' | 'brain' | 'room' | 'pass'>('none')
  const [selectedItem, setSelectedItem] = useState<PlateItem | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  const capacity = calculateCapacity(checkin)
  const used = activePoints(items)
  const percent = Math.round((used / capacity) * 100)
  const fullness = capacityLabel(percent)
  const suggestions = useMemo(() => suggestRoom(items, capacity), [items, capacity])

  if (!entered) return <AuthGate onDemo={() => setEntered(true)} />

  function chooseTheme(theme: ThemeId) {
    setProfile((current) => ({ ...current, theme }))
    localStorage.setItem('myplate-theme', theme)
  }

  function applyRoom(action: string, itemId: string) {
    if (action === 'move') setItems((current) => current.map((item) => item.id === itemId ? { ...item, status: 'side-plate' } : item))
    if (action === 'split') setItems((current) => current.map((item) => item.id === itemId ? { ...item, points: Math.max(5, Math.round(item.points / 2)), title: `${item.title} · next step` } : item))
    if (action === 'pass') {
      const item = items.find((candidate) => candidate.id === itemId)
      if (item) { setSelectedItem(item); setModal('pass'); return }
    }
    setModal('none')
  }

  function sendPass(kind: RequestKind, recipientId?: string) {
    if (!selectedItem) return
    setRequests((current) => [{
      id: crypto.randomUUID(), senderId: profile.id, recipientId, publicTitle: selectedItem.title,
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
          <span className="demo-chip">Interactive preview</span>
          <button className="icon-button" aria-label="Notifications"><Bell /></button>
          <button className="avatar-button" aria-label="Open profile"><span>{profile.initials}</span></button>
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
          <button className="profile-row" onClick={() => setModal('theme')}><span className="mini-avatar">{profile.initials}</span><span><b>{profile.displayName}</b><small>{themes.find((t) => t.id === profile.theme)?.name}</small></span><Settings size={17} /></button>
        </div>
      </aside>

      <main id="main" className="main-content">
        {view === 'plate' && <PlateView items={items} capacity={capacity} used={used} percent={percent} fullness={fullness} onCheckin={() => setModal('checkin')} onBrain={() => setModal('brain')} onRoom={() => setModal('room')} onPass={(item) => { setSelectedItem(item); setModal('pass') }} />}
        {view === 'table' && <TableView onRequest={() => { setSelectedItem(items.find((i) => i.status === 'active') ?? null); setModal('pass') }} />}
        {view === 'requests' && <RequestsView requests={requests} setRequests={setRequests} />}
        {view === 'insights' && <InsightsView />}
        {view === 'privacy' && <PrivacyView />}
      </main>

      {modal === 'theme' && <ThemeModal current={profile.theme} onChoose={chooseTheme} onClose={() => setModal('none')} />}
      {modal === 'checkin' && <CheckinModal value={checkin} onSave={(next) => { setCheckin(next); setModal('none') }} onClose={() => setModal('none')} />}
      {modal === 'brain' && <BrainDumpModal onApply={(newItems) => { setItems((current) => [...newItems, ...current]); setModal('none') }} onClose={() => setModal('none')} />}
      {modal === 'room' && <RoomModal used={used} capacity={capacity} suggestions={suggestions} onApply={applyRoom} onClose={() => setModal('none')} />}
      {modal === 'pass' && selectedItem && <PassModal item={selectedItem} onSend={sendPass} onClose={() => { setSelectedItem(null); setModal('none') }} />}
    </div>
  )
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b className="nav-badge">{badge}</b> : null}</button>
}

function PlateView({ items, capacity, used, percent, fullness, onCheckin, onBrain, onRoom, onPass }: {
  items: PlateItem[]; capacity: number; used: number; percent: number; fullness: { label: string; message: string };
  onCheckin: () => void; onBrain: () => void; onRoom: () => void; onPass: (item: PlateItem) => void
}) {
  const active = items.filter((item) => item.status === 'active')
  const side = items.filter((item) => item.status === 'side-plate')
  return <>
    <section className="page-heading">
      <div><p className="eyebrow">SATURDAY, AUGUST 15</p><h1>Good evening, Jasmine.</h1><p>Your capacity changed today. Your plan can change with it.</p></div>
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
            </div>
          </div>
        </div>
        <div className="load-key"><span>◎ Cognitive</span><span>♥ Emotional</span><span>↟ Physical</span><span>✦ Sensory</span><span>◌ Social</span></div>
      </article>
      <aside className="today-card">
        <div className="section-title"><div><p className="eyebrow">TODAY’S PLAN</p><h2>Commitments</h2></div><button className="small-add" aria-label="Add commitment"><Plus /></button></div>
        <div className="item-list">{active.map((item) => <div className="item-row" key={item.id}><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.category} · {item.points} pts {item.due ? `· ${item.due}` : ''}</small></div><button className="icon-button subtle" onClick={() => onPass(item)} aria-label={`Pass ${item.title}`}><HandHeart /></button></div>)}</div>
        {side.length > 0 && <div className="side-plate"><span><Clock3 size={17} /> Side plate</span>{side.map((item) => <small key={item.id}>{item.title}</small>)}</div>}
      </aside>
    </section>
  </>
}

function TableView({ onRequest }: { onRequest: () => void }) {
  return <>
    <section className="page-heading"><div><p className="eyebrow">YOUR TRUSTED CIRCLE</p><h1>Our Table</h1><p>Shared care without shared surveillance.</p></div><button className="primary-button" onClick={onRequest}><HandHeart size={18} /> Ask for support</button></section>
    <div className="table-hero">
      <div><span className="status-dot open" /> <b>Home Team</b><small>3 people · private circle</small></div>
      <button className="secondary-button"><Plus size={17} /> Invite someone</button>
    </div>
    <section className="member-grid">
      {demoCircle.members.map((member) => <article className="member-card" key={member.id}><div className="member-top"><span className={`member-avatar member-${member.theme}`}>{member.initials}</span><div><h3>{member.displayName}{member.id === 'jasmine' ? ' · You' : ''}</h3><p><span className={`status-dot ${member.sharedStatus}`} /> {member.sharedStatus}</p></div></div><div className="shared-meter"><span style={{ width: `${Math.min(member.capacityPercent, 100)}%` }} /></div><p className="member-summary">{member.id === 'jasmine' ? 'You chose to share status only.' : member.sharedStatus === 'open' ? 'Open to support requests today.' : 'Protecting recovery time.'}</p></article>)}
    </section>
    <section className="shared-board"><div className="section-title"><div><p className="eyebrow">SHARED DISHES</p><h2>What we’re carrying together</h2></div></div><div className="shared-items"><div><span className="shared-icon">⌂</span><b>Plan Sunday dinner</b><small>Maria + Jasmine · shared</small></div><div><span className="shared-icon">✦</span><b>Prepare for family visit</b><small>3 contributors · 2 steps left</small></div><div className="empty-shared"><Plus /><span>Add a shared responsibility</span></div></div></section>
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

function InsightsView() {
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

function ThemeModal({ current, onChoose, onClose }: { current: ThemeId; onChoose: (id: ThemeId) => void; onClose: () => void }) {
  return <Modal title="Choose your plate" onClose={onClose} wide><p className="eyebrow">YOUR PLATE, YOUR WAY</p><h2>Choose a visual atmosphere.</h2><p className="modal-intro">Every theme preserves contrast, readable labels, and non-color status cues.</p><div className="theme-grid">{themes.map((theme) => <button className={`theme-option ${current === theme.id ? 'selected' : ''}`} key={theme.id} onClick={() => onChoose(theme.id)}><span className="theme-preview" style={{ background: theme.colors[1] }}><i style={{ background: theme.colors[0] }} /><i style={{ background: theme.colors[2] }} /><i style={{ background: theme.colors[0] }} /></span><b>{theme.name}</b><small>{theme.description}</small>{current === theme.id && <span className="selected-check"><Check /></span>}</button>)}</div><div className="modal-footer"><button className="secondary-button"><Accessibility size={17} /> Accessibility settings</button><button className="primary-button" onClick={onClose}>Use this theme</button></div></Modal>
}

function CheckinModal({ value, onSave, onClose }: { value: CapacityCheckin; onSave: (value: CapacityCheckin) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const labels: [keyof CapacityCheckin, string, string][] = [['physical', 'Physical energy', 'How available does your body feel?'], ['cognitive', 'Cognitive clarity', 'How much focus is accessible?'], ['emotional', 'Emotional bandwidth', 'How much feeling can you hold?'], ['sensory', 'Sensory tolerance', 'How much input can you take in?'], ['social', 'Social capacity', 'How available are you to people?'], ['recovery', 'Recovery need', 'How much softness do you need afterward?']]
  return <Modal title="Capacity check-in" onClose={onClose}><p className="eyebrow">A MOMENT WITH YOURSELF</p><h2>What does today actually have available?</h2><p className="modal-intro">This is an editable planning estimate, not a health assessment.</p><div className="checkin-list">{labels.map(([key, label, help]) => <label key={key}><span><b>{label}</b><small>{help}</small></span><input type="range" min="1" max="5" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} /><strong>{draft[key]}/5</strong></label>)}</div><div className="capacity-preview"><Sparkles /><span><b>About {calculateCapacity(draft)} points available</b><small>You can edit this number after saving.</small></span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSave(draft)}>Save today’s capacity</button></div></Modal>
}

function BrainDumpModal({ onApply, onClose }: { onApply: (items: PlateItem[]) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<PlateItem[]>([])
  function organize() {
    const pieces = text.split(/\n|,|\band\b/i).map((part) => part.trim()).filter((part) => part.length > 2).slice(0, 6)
    const categories = ['work', 'home', 'health', 'social', 'creative'] as const
    setProposal(pieces.map((title, index) => ({ id: crypto.randomUUID(), title: title.replace(/^i (need|have) to /i, ''), category: categories[index % categories.length], points: [10, 15, 20, 25][index % 4], loads: index % 2 ? ['cognitive', 'social'] : ['cognitive'], status: 'active', ownerId: 'jasmine' })))
  }
  return <Modal title="Brain dump" onClose={onClose} wide><p className="eyebrow">MESSY IS WELCOME</p><h2>Put everything on the table.</h2><p className="modal-intro">AI organizes a review-only proposal. Nothing touches your plate until you approve it.</p>{proposal.length === 0 ? <><textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="I need to finish the deck, pick up groceries, call my doctor, and I promised I’d check on my friend…" /><div className="safe-callout"><ShieldCheck /><span>Only this message is used for this request. It is never shared with your circle.</span></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={text.trim().length < 5} onClick={organize}><WandSparkles size={17} /> Organize my thoughts</button></div></> : <><div className="proposal-list">{proposal.map((item) => <label key={item.id}><input type="checkbox" defaultChecked /><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.category} · {item.points} points · {item.loads.join(' + ')}</small></div><em>AI proposal</em></label>)}</div><div className="modal-footer end"><button className="secondary-button" onClick={() => setProposal([])}>Back</button><button className="primary-button" onClick={() => onApply(proposal)}><Check size={17} /> Add {proposal.length} approved items</button></div></>}</Modal>
}

function RoomModal({ used, capacity, suggestions, onApply, onClose }: { used: number; capacity: number; suggestions: Array<any>; onApply: (action: string, itemId: string) => void; onClose: () => void }) {
  return <Modal title="Make Room Plus" onClose={onClose} wide><p className="eyebrow">OPTIONS, NOT ORDERS</p><h2>Let’s make this plan fit your actual life.</h2><p className="modal-intro">You have {used} points committed and about {capacity} available. Choose one strategy to preview—MyPlate+ will never change your commitments automatically.</p><div className="room-summary"><span>{used - capacity > 0 ? `${used - capacity} points over` : 'Your plate fits'}</span><div><i style={{ width: `${Math.min(100, (capacity / used) * 100)}%` }} /></div></div><div className="suggestion-grid">{suggestions.length ? suggestions.map((suggestion) => <article key={suggestion.id}><span className="suggestion-icon">{suggestion.action === 'pass' ? <HeartHandshake /> : suggestion.action === 'split' ? <Sparkles /> : <Clock3 />}</span><h3>{suggestion.title}</h3><p>{suggestion.detail}</p><button className="secondary-button full" onClick={() => onApply(suggestion.action, suggestion.itemId)}>Choose this option <ArrowRight size={16} /></button></article>) : <div className="all-good"><Check /><h3>Your plate fits.</h3><p>You can still protect recovery time or move something intentionally.</p></div>}</div><p className="ai-disclaimer"><ShieldCheck size={15} /> Suggestions are based on your approved plate data. They are not medical advice.</p></Modal>
}

function PassModal({ item, onSend, onClose }: { item: PlateItem; onSend: (kind: RequestKind, recipientId?: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<RequestKind>('take-it')
  const [recipient, setRecipient] = useState<string>('maria')
  return <Modal title="Pass the Plate" onClose={onClose}><p className="eyebrow">SHARE THE REQUEST, NOT YOUR PRIVATE PLATE</p><h2>How would support help?</h2><div className="passing-item"><span className="item-color" style={{ background: categoryColor[item.category] }} /><div><b>{item.title}</b><small>{item.points} capacity points</small></div></div><div className="support-types">{(Object.keys(requestLabels) as RequestKind[]).map((key) => <button className={kind === key ? 'selected' : ''} onClick={() => setKind(key)} key={key}>{requestLabels[key]}</button>)}</div><label className="field-label">Ask someone<select value={recipient} onChange={(e) => setRecipient(e.target.value)}><option value="maria">Maria · open</option><option value="devon">Devon · recovering</option><option value="">Anyone at the table</option></select></label><div className="share-receipt"><LockKeyhole /><div><b>They will see</b><span>“{item.title}” · {requestLabels[kind]} · {item.points} points</span><b>They will not see</b><span>Your check-in, private notes, other commitments, or AI conversation.</span></div></div><div className="modal-footer end"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onSend(kind, recipient || undefined)}><HandHeart size={17} /> Send support request</button></div></Modal>
}
