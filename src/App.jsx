import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, Card, Dropdown, Input, Modal } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { HabitsPage, PlannerPage, StudySessionsPage, SyllabusPage } from './pages/AcademicPages'
import { KnowledgePage } from './pages/KnowledgePage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { RecoveryPage } from './pages/RecoveryPage'
import { ForecastPage } from './pages/ForecastPage'
import { get } from './lib/api'
import './App.css'

const navigation = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Syllabus', path: '/syllabus', icon: BookOpen },
  { label: 'Habits', path: '/habits', icon: Flame },
  { label: 'Study sessions', path: '/study-sessions', icon: Clock3 },
  { label: 'Knowledge analysis', path: '/knowledge', icon: Brain },
  { label: 'Analytics', path: '/analytics', icon: Activity },
  { label: 'Recovery planner', path: '/recovery', icon: Leaf },
  { label: 'Exam forecast', path: '/forecast', icon: TrendingUp },
  { label: 'Settings', path: '/settings', icon: Settings },
]

const routeTitles = { '/planner': 'Study plan', '/settings': 'Settings' }

function getPath() {
  return window.location.pathname === '/' ? '/dashboard' : window.location.pathname
}

function App() {
  const [path, setPath] = useState(getPath)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchInputRef = useRef(null)
  const reduceMotion = useReducedMotion()
  const currentPage = navigation.find((item) => item.path === path)
  const pageTitle = currentPage?.label ?? routeTitles[path] ?? 'Not found'

  useEffect(() => {
    const handlePopState = () => setPath(getPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    function handleSearchShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMobileSearchOpen(true)
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [])

  useEffect(() => {
    if (search.trim().length < 2) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')
      try {
        const [subjects, topics, habits] = await Promise.all([
          get('/subjects'),
          get('/topics'),
          get('/habits'),
        ])
        if (!active) return
        const query = search.trim().toLocaleLowerCase()
        const matches = [
          ...subjects.filter((item) => item.name.toLocaleLowerCase().includes(query))
            .map((item) => ({ id: `subject-${item.id}`, label: item.name, type: 'Subject', path: '/syllabus' })),
          ...topics.filter((item) => item.title.toLocaleLowerCase().includes(query))
            .map((item) => ({ id: `topic-${item.id}`, label: item.title, type: 'Topic', path: '/syllabus' })),
          ...habits.filter((item) => item.name.toLocaleLowerCase().includes(query))
            .map((item) => ({ id: `habit-${item.id}`, label: item.name, type: 'Habit', path: '/habits' })),
        ]
        setSearchResults(matches.slice(0, 8))
      } catch (requestError) {
        if (active) setSearchError(requestError.message)
      } finally {
        if (active) setSearchLoading(false)
      }
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [search])

  function navigate(event, destination) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    window.history.pushState({}, '', destination)
    setPath(destination)
    setMobileNavOpen(false)
    setSearch('')
    setSearchResults([])
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
  }

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></div>
          <span className="brand-name">study<span>signal</span></span>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">S</div>
          <div className="workspace-copy"><strong>Student</strong><span>Personal workspace</span></div>
          <ChevronDown size={16} className="workspace-chevron" />
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <a
                href={item.path}
                key={item.path}
                className={`nav-link ${path === item.path ? 'nav-link-active' : ''}`}
                onClick={(event) => navigate(event, item.path)}
                aria-current={path === item.path ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>
        <div className="sidebar-spacer" />
        <nav className="bottom-nav" aria-label="Support and settings">
          <button className="nav-link nav-link-button" onClick={() => setShowHelp(true)}><CircleHelp size={18} /><span>Help center</span></button>
        </nav>
        <div className="sidebar-footer">
          <div className="footer-avatar">S</div>
          <div className="workspace-copy"><strong>Student</strong><span>Single-user workspace</span></div>
          <MoreHorizontal size={19} className="footer-more" />
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="global-search-root">
              <button
                type="button"
                className="mobile-search-toggle"
                aria-label="Open search"
                onClick={() => {
                  setMobileSearchOpen(true)
                  window.requestAnimationFrame(() => searchInputRef.current?.focus())
                }}
              >
                <Search size={16} />
              </button>
              <label className={`search-field${mobileSearchOpen ? ' search-field-mobile-open' : ''}`}>
                <Search size={16} />
                <Input ref={searchInputRef} aria-label="Search subjects, topics, and habits" aria-expanded={search.trim().length > 1} aria-controls="global-search-results" placeholder="Search subjects, topics..." value={search} onChange={(event) => { const value = event.target.value; setSearch(value); if (value.trim().length < 2) { setSearchResults([]); setSearchError(''); setSearchLoading(false) } }} onKeyDown={(event) => { if (event.key === 'Escape') { setSearch(''); setMobileSearchOpen(false); event.currentTarget.blur() } }} />
                <kbd><Command size={11} /> K</kbd>
              </label>
              {search.trim().length > 1 && <div className="global-search-results" id="global-search-results" role="listbox" aria-label="Search results">
                {searchLoading ? <span className="global-search-message">Searching your records…</span>
                  : searchError ? <span className="global-search-message search-error">{searchError}</span>
                    : searchResults.length ? searchResults.map((result) => <a key={result.id} href={result.path} onClick={(event) => { setSearch(''); setMobileSearchOpen(false); navigate(event, result.path) }} role="option"><span>{result.label}</span><small>{result.type}</small></a>)
                      : <span className="global-search-message">No matching subjects, topics, or habits.</span>}
              </div>}
            </div>
            <Dropdown
            trigger={<button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /></button>}
              align="right"
            >
              <div className="notification-menu">
                <strong>Notifications are not available yet</strong>
                <span>Upcoming tasks and revisions are shown on your dashboard.</span>
              </div>
            </Dropdown>
            <Dropdown
              trigger={<button className="topbar-profile" aria-label="Open profile menu"><span className="profile-avatar">S</span><ChevronDown size={15} /></button>}
              align="right"
            >
              <a className="dropdown-option dropdown-link" href="/settings" onClick={(event) => navigate(event, '/settings')}>Profile settings</a>
            </Dropdown>
          </div>
        </header>

        <main className="page-main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={path}
              initial={reduceMotion ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              {path === '/dashboard' || path === '/' ? (
                <DashboardPage onQuickAdd={() => setShowQuickAdd(true)} />
              ) : path === '/syllabus' ? (
                <SyllabusPage />
              ) : path === '/habits' ? (
                <HabitsPage />
              ) : path === '/study-sessions' ? (
                <StudySessionsPage />
              ) : path === '/planner' ? (
                <PlannerPage />
              ) : path === '/knowledge' ? (
                <KnowledgePage />
              ) : path === '/analytics' ? (
                <AnalyticsPage />
              ) : path === '/recovery' ? (
                <RecoveryPage />
              ) : path === '/forecast' ? (
                <ForecastPage />
              ) : path === '/settings' ? (
                <SettingsPage />
              ) : (
                <NotFoundPage onNavigate={navigate} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Modal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} title="Add to your study plan">
        <p className="modal-description">Choose where you’d like to spend your study time.</p>
        <div className="quick-add-options">
          <a href="/study-sessions" onClick={(event) => { setShowQuickAdd(false); navigate(event, '/study-sessions') }}><Clock3 size={18} /><span><strong>Study session</strong><small>Start a focus timer or log time</small></span><ChevronRight size={17} /></a>
          <a href="/planner" onClick={(event) => { setShowQuickAdd(false); navigate(event, '/planner') }}><Target size={18} /><span><strong>Study plan</strong><small>Schedule time for a topic</small></span><ChevronRight size={17} /></a>
        </div>
      </Modal>
      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="StudySignal help">
        <div className="help-center-content">
          <p className="modal-description">A practical guide to the records and transparent calculations available in this single-user MVP.</p>
          <HelpSection title="Getting started">Create a subject, add its units and topics in Syllabus, then add habits or schedule study tasks. Dashboard summaries appear as you record activity.</HelpSection>
          <HelpSection title="Subjects, units, and topics">Subjects may have an optional exam date. Add units and topics underneath them. Topic status is independent of habit check-ins, study sessions, and assessment results.</HelpSection>
          <HelpSection title="Habits and daily logs">Choose a habit frequency and mark today complete or undo it. Daily streaks count consecutive calendar days, weekday streaks skip weekends, and weekly streaks count consecutive Monday–Sunday weeks with at least one check-in. An unfinished current week remains active until Sunday ends. The dashboard count shows how many habits currently have an active streak.</HelpSection>
          <HelpSection title="Study timer">Choose a topic, start, pause, or resume the timer. Active timer state is saved by the backend and restored when you return. Ending saves recorded study time; discarding does not create a study session. A session never completes its topic.</HelpSection>
          <HelpSection title="Knowledge assessments">Record optional quiz and recall scores (0–100) and confidence (1–5, mapped to 20–100%). Assessment attempts are retained as history; an update is recorded as a new attempt. Confidence alone is not enough to produce a verified evidence score.</HelpSection>
          <HelpSection title="Evidence score">When quiz (Q), recall (R), and confidence percentage (C) exist, E = 0.60Q + 0.25R + 0.15C. Missing components are removed and remaining weights are renormalized. Without quiz or recall evidence, the topic is UNVERIFIED. These scores are not validated measures of intelligence or mastery.</HelpSection>
          <HelpSection title="Academic Drift">Time drift = max(0, (planned minutes − actual minutes) / planned minutes) × 100. Task drift uses planned and completed task counts separately. A zero plan yields an unavailable (null) percentage.</HelpSection>
          <HelpSection title="Academic Debt">Overdue study plans use priority weight (Low 1, Medium 2, High 3) multiplied by overdue days capped at seven. Overdue revisions use two points per overdue day, capped at seven. Skipped plans are shown separately in debt. This is an organizational indicator, not a judgment about you.</HelpSection>
          <HelpSection title="Knowledge Gaps">Knowledge analysis highlights weak or declining recorded assessment evidence, unverified topics, and pending revisions. Missing assessment data is not treated as failure. Classification thresholds are configurable on the backend.</HelpSection>
          <HelpSection title="Recovery recommendations">Recommendations rank topic actions using exam urgency (30%), knowledge weakness (30%), syllabus incompletion (25%), and revision delay (15%). Missing factors are excluded and remaining weights renormalized. Recommendations do not change topic status.</HelpSection>
          <HelpSection title="Exam Forecast">The baseline counts distinct topics with completion events in the last 14 calendar days and divides by 14. It estimates remaining completion time and compares it with an exam date. What-if rates assume a steady pace; forecasts do not guarantee completion or predict exam marks.</HelpSection>
          <HelpSection title="Data and limitations">StudySignal is a single-user MVP. Local development uses SQLite; the production adapter supports Turso when configured. Accounts, authentication, user profile management, and cross-user synchronization are not provided. Results depend on accurate and complete records.</HelpSection>
        </div>
      </Modal>
    </div>
  )
}

function SettingsPage() {
  return (
    <section className="academic-page">
      <div className="page-heading academic-page-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div><h1><Settings size={23} /> Settings</h1><p>Storage and account information for this single-user MVP.</p></div>
      </div>
      <Card className="settings-notice">
        <ShieldCheck size={19} />
        <div><strong>Storage depends on the environment</strong><p>Local development uses a SQLite database through better-sqlite3. The production backend is designed to use Turso through the libSQL adapter when the deployment is configured with Turso credentials. This page does not expose credentials or deployment settings.</p></div>
      </Card>
      <Card className="settings-notice">
        <Settings size={19} />
        <div><strong>Single-user MVP</strong><p>StudySignal currently has no authentication, user accounts, profile customization, or cross-user cloud synchronization. No additional user-adjustable preferences are implemented here.</p></div>
      </Card>
    </section>
  )
}

function HelpSection({ title, children }) {
  return <section className="help-section"><h3>{title}</h3><p>{children}</p></section>
}

function NotFoundPage({ onNavigate }) {
  return (
    <section className="not-found">
      <div className="not-found-mark"><ShieldCheck size={27} /></div>
      <h1>Page not found</h1>
      <p>That StudySignal page doesn’t exist yet. Head back to your dashboard to keep going.</p>
      <Button onClick={(event) => onNavigate(event, '/dashboard')} icon={ArrowRight}>Go to dashboard</Button>
    </section>
  )
}

export default App
