import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Archive, BookOpen, Check, Clock3, Flame, Play, Plus, Square, Target, Pause } from 'lucide-react'
import { Button, Card, Input, ProgressBar } from '../components/ui'
import { create, get, remove, update } from '../lib/api'

const topicStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']
const priorities = ['LOW', 'MEDIUM', 'HIGH']

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateOffset(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function useRemoteState(loader) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    loader().then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loader])
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [loader])
  return { data, loading, error, refresh }
}

function PageHeader({ title, description, icon: Icon }) {
  return (
    <div className="page-heading academic-page-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div>
        <h1><Icon size={23} /> {title}</h1>
        <p>{description}</p>
      </div>
    </div>
  )
}

function PageFeedback({ loading, error, notice, onDismiss }) {
  if (loading) return <Card className="feature-state feature-loading"><span className="loading-spinner" /> Loading your saved data…</Card>
  if (error) return <Card className="feature-state feature-error" role="alert"><strong>Couldn’t load your data</strong><span>{error}</span><button className="text-link" onClick={onDismiss}>Try again</button></Card>
  if (notice) return <div className="feature-success" role="status"><Check size={15} />{notice}</div>
  return null
}

function useMutation(refresh) {
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const run = useCallback(async (action, message = 'Changes saved.') => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      await refresh()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [refresh])
  return { saving, notice, error, run, setError }
}

export function SyllabusPage() {
  const loader = useCallback(async () => {
    const [subjects, units, topics] = await Promise.all([get('/subjects'), get('/units'), get('/topics')])
    return subjects.map((subject) => {
      const subjectUnits = units.filter((unit) => unit.subject_id === subject.id).map((unit) => ({
        ...unit,
        topics: topics.filter((topic) => topic.unit_id === unit.id),
      }))
      const allTopics = subjectUnits.flatMap((unit) => unit.topics)
      return {
        ...subject,
        units: subjectUnits,
        totalTopics: allTopics.length,
        completedTopics: allTopics.filter((topic) => topic.status === 'COMPLETED').length,
      }
    })
  }, [])
  const { data: subjects, loading, error, refresh } = useRemoteState(loader)
  const { saving, notice, error: mutationError, run } = useMutation(refresh)
  const [subjectForm, setSubjectForm] = useState({ name: '', semester: '', exam_date: '' })

  async function addSubject(event) {
    event.preventDefault()
    const result = await run(() => create('/subjects', { ...subjectForm, exam_date: subjectForm.exam_date || null }), 'Subject created.')
    if (result) setSubjectForm({ name: '', semester: '', exam_date: '' })
  }

  return (
    <section className="academic-page">
      <PageHeader title="Syllabus" description="Build your subject outline, track topics, and see progress based on completed topics." icon={BookOpen} />
      {loading || error ? <PageFeedback loading={loading} error={error} onDismiss={refresh} /> : (
        <>
          {(notice || mutationError) && <div className={mutationError ? 'feature-error feature-inline-error' : ''} role={mutationError ? 'alert' : 'status'}>{mutationError || notice}</div>}
          <Card className="feature-form-card">
            <div className="feature-card-heading"><div><h2>Add a subject</h2><p>Set up a course and optionally add its exam date.</p></div></div>
            <form className="form-grid subject-create-form" onSubmit={addSubject}>
              <label>Subject name<Input required maxLength={100} placeholder="e.g. Biology" value={subjectForm.name} onChange={(event) => setSubjectForm({ ...subjectForm, name: event.target.value })} /></label>
              <label>Semester<Input required maxLength={50} placeholder="e.g. Semester 1" value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })} /></label>
              <label>Exam date<Input type="date" value={subjectForm.exam_date} onChange={(event) => setSubjectForm({ ...subjectForm, exam_date: event.target.value })} /></label>
              <Button type="submit" icon={Plus} disabled={saving}>{saving ? 'Saving…' : 'Add subject'}</Button>
            </form>
          </Card>
          {!subjects?.length ? <EmptyState title="Your syllabus starts here" detail="Add a subject above, then build it out with units and topics." /> : (
            <div className="subject-list">
              {subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} run={run} saving={saving} />)}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SubjectCard({ subject, run, saving }) {
  const [unitTitle, setUnitTitle] = useState('')
  const total = subject.totalTopics
  const percent = total ? Math.round((subject.completedTopics / total) * 100) : 0
  async function addUnit(event) {
    event.preventDefault()
    const success = await run(() => create('/units', { subject_id: subject.id, title: unitTitle, position: subject.units.length }), 'Unit added.')
    if (success) setUnitTitle('')
  }

  return (
    <Card className="subject-card">
      <div className="subject-card-top">
        <div className="subject-heading"><div className="subject-avatar"><BookOpen size={18} /></div><div><h2>{subject.name}</h2><span>{subject.semester}{subject.exam_date ? ` · Exam ${subject.exam_date}` : ''}</span></div></div>
        <div className="subject-progress-summary"><strong>{subject.completedTopics}/{total}</strong><span>topics complete</span></div>
      </div>
      <ProgressBar value={percent} className="subject-progress" aria-label={`${subject.name} syllabus progress`} />
      <div className="subject-progress-caption"><span>{percent}% complete</span><details className="edit-details"><summary>Edit subject</summary><SubjectEdit subject={subject} run={run} saving={saving} /></details></div>
      <div className="unit-list">
        {subject.units.map((unit) => <UnitCard unit={unit} key={unit.id} run={run} saving={saving} />)}
      </div>
      <form className="inline-create-form" onSubmit={addUnit}>
        <Input required maxLength={150} aria-label={`New unit for ${subject.name}`} placeholder="New unit name" value={unitTitle} onChange={(event) => setUnitTitle(event.target.value)} />
        <Button type="submit" variant="secondary" icon={Plus} disabled={saving}>Add unit</Button>
      </form>
    </Card>
  )
}

function SubjectEdit({ subject, run, saving }) {
  const [values, setValues] = useState({ name: subject.name, semester: subject.semester, exam_date: subject.exam_date || '' })
  async function submit(event) {
    event.preventDefault()
    await run(() => update(`/subjects/${subject.id}`, { ...values, exam_date: values.exam_date || null }), 'Subject updated.')
  }
  return <form className="edit-popover-form" onSubmit={submit}><Input required aria-label="Subject name" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /><Input required aria-label="Semester" value={values.semester} onChange={(event) => setValues({ ...values, semester: event.target.value })} /><Input type="date" aria-label="Exam date" value={values.exam_date} onChange={(event) => setValues({ ...values, exam_date: event.target.value })} /><Button type="submit" disabled={saving}>Save changes</Button></form>
}

function UnitCard({ unit, run, saving }) {
  const [topicTitle, setTopicTitle] = useState('')
  async function addTopic(event) {
    event.preventDefault()
    const success = await run(() => create('/topics', { unit_id: unit.id, title: topicTitle }), 'Topic added.')
    if (success) setTopicTitle('')
  }
  return (
    <div className="unit-card">
      <div className="unit-heading"><strong>{unit.title}</strong><span>{unit.topics.length} {unit.topics.length === 1 ? 'topic' : 'topics'}</span></div>
      {!unit.topics.length ? <p className="unit-empty">Add a topic to start tracking this unit.</p> : (
        <div className="topic-list">{unit.topics.map((topic) => <TopicRow topic={topic} key={topic.id} run={run} saving={saving} />)}</div>
      )}
      <form className="inline-create-form topic-create-form" onSubmit={addTopic}><Input required maxLength={180} aria-label={`New topic for ${unit.title}`} placeholder="New topic name" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} /><Button type="submit" variant="secondary" icon={Plus} disabled={saving}>Add topic</Button></form>
    </div>
  )
}

function TopicRow({ topic, run, saving }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(topic.title)
  async function deleteTopic() {
    if (!window.confirm(`Delete “${topic.title}”? A topic with study history cannot be deleted.`)) return
    await run(() => remove(`/topics/${topic.id}`), 'Topic deleted.')
  }
  async function saveTitle(event) {
    event.preventDefault()
    if (title.trim() === topic.title) { setEditing(false); return }
    const saved = await run(() => update(`/topics/${topic.id}`, { title }), 'Topic updated.')
    if (saved) setEditing(false)
  }
  return (
    <div className="topic-row">
      <span className={`topic-status-indicator status-${topic.status.toLowerCase()}`} />
      <div className="topic-row-main">
        {editing ? <form className="topic-title-edit" onSubmit={saveTitle}><Input required value={title} onChange={(event) => setTitle(event.target.value)} /><Button variant="secondary" type="submit" disabled={saving}>Save</Button></form> : <strong>{topic.title}</strong>}
        <span>{topic.estimated_minutes} min estimate</span>
      </div>
      <select aria-label={`Status for ${topic.title}`} value={topic.status} onChange={(event) => run(() => update(`/topics/${topic.id}`, { status: event.target.value }), 'Topic status updated.')} disabled={saving}>
        {topicStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
      </select>
      <select aria-label={`Priority for ${topic.title}`} value={topic.priority} onChange={(event) => run(() => update(`/topics/${topic.id}`, { priority: event.target.value }), 'Topic priority updated.')} disabled={saving}>
        {priorities.map((priority) => <option key={priority} value={priority}>{priority} priority</option>)}
      </select>
      {!editing && <button className="quiet-action" onClick={() => setEditing(true)}>Edit</button>}
      <button className="quiet-action quiet-danger" onClick={deleteTopic}>Delete</button>
    </div>
  )
}

export function HabitsPage() {
  const loader = useCallback(async () => {
    const [habits, logs] = await Promise.all([
      get('/habits'),
      get(`/habit-logs?from=${dateOffset(-6)}&to=${localDate()}`),
    ])
    const history = await Promise.all(habits.map(async (habit) => {
      const summary = await get(`/habits/${habit.id}/history`)
      return [habit.id, summary]
    }))
    return { habits, logs, history: Object.fromEntries(history) }
  }, [])
  const { data, loading, error, refresh } = useRemoteState(loader)
  const { saving, notice, error: mutationError, run } = useMutation(refresh)
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState('DAILY')
  const selectedDate = localDate()

  async function addHabit(event) {
    event.preventDefault()
    const success = await run(() => create('/habits', { name, frequency }), 'Habit created.')
    if (success) setName('')
  }
  async function toggleHabit(habit) {
    const log = data.logs.find((item) => item.habit_id === habit.id && item.log_date === selectedDate)
    if (log) await run(() => update(`/habit-logs/${log.id}`, { completed: !log.completed }), log.completed ? 'Completion undone.' : 'Habit completed.')
    else await run(() => create('/habit-logs', { habit_id: habit.id, log_date: selectedDate, completed: true }), 'Habit completed.')
  }
  async function editHabit(habit) {
    const updatedName = window.prompt('Edit habit name', habit.name)
    if (updatedName === null) return
    const updatedFrequency = window.prompt('Frequency: DAILY, WEEKDAYS, or WEEKLY', habit.frequency)
    if (updatedFrequency === null) return
    const success = await run(() => update(`/habits/${habit.id}`, { name: updatedName, frequency: updatedFrequency.toUpperCase() }), 'Habit updated.')
    return success
  }

  return (
    <section className="academic-page">
      <PageHeader title="Habits" description="Build a routine that feels sustainable. Completions stay separate from syllabus topics." icon={Flame} />
      <PageFeedback loading={loading} error={error} onDismiss={refresh} />
      {!loading && !error && <>
        {(notice || mutationError) && <div className={mutationError ? 'feature-error feature-inline-error' : 'feature-success'} role={mutationError ? 'alert' : 'status'}>{notice || mutationError}</div>}
        <Card className="feature-form-card"><div className="feature-card-heading"><div><h2>Create a habit</h2><p>Your history is saved by local calendar date.</p></div></div><form className="inline-create-form habit-create-form" onSubmit={addHabit}><Input required maxLength={120} placeholder="e.g. Review notes for 15 minutes" value={name} onChange={(event) => setName(event.target.value)} /><select aria-label="Habit frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="DAILY">Daily</option><option value="WEEKDAYS">Weekdays</option><option value="WEEKLY">Weekly</option></select><Button type="submit" icon={Plus} disabled={saving}>{saving ? 'Saving…' : 'Add habit'}</Button></form></Card>
        {!data.habits.length ? <EmptyState title="No habits yet" detail="Create one small habit above and check it off when you complete it." /> : <div className="habit-list">{data.habits.map((habit) => {
          const todayLog = data.logs.find((log) => log.habit_id === habit.id && log.log_date === selectedDate && log.completed)
          const habitHistory = data.history[habit.id]
          return (
            <Card className={`habit-entry ${habit.is_active ? '' : 'habit-archived'}`} key={habit.id}>
              <div className="habit-entry-heading"><div className="habit-entry-icon"><Flame size={18} /></div><div className="habit-entry-name"><h2>{habit.name}</h2><span>{habit.frequency.toLowerCase()} · {habit.is_active ? 'Active' : 'Archived'}</span></div><div className="habit-streak-stats"><span><strong>{habitHistory.current_streak}</strong> current</span><span><strong>{habitHistory.longest_streak}</strong> best</span></div></div>
              <div className="habit-entry-bottom"><div className="habit-week-history">{Array.from({ length: 7 }, (_, index) => {
                const date = dateOffset(index - 6)
                const completed = data.logs.some((log) => log.habit_id === habit.id && log.log_date === date && log.completed)
                return <span key={date} title={`${date}${completed ? ' completed' : ''}`} className={completed ? 'history-day history-day-done' : 'history-day'}><small>{new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1)}</small>{completed && <Check size={11} />}</span>
              })}</div><div className="habit-controls"><button className="quiet-action" onClick={() => editHabit(habit)} disabled={saving}>Edit</button><button className="quiet-action" onClick={() => run(() => update(`/habits/${habit.id}`, { is_active: !habit.is_active }), habit.is_active ? 'Habit archived.' : 'Habit restored.')} disabled={saving}>{habit.is_active ? <><Archive size={13} /> Archive</> : 'Restore'}</button>{habit.is_active && <Button variant={todayLog ? 'secondary' : 'primary'} icon={todayLog ? Check : Flame} onClick={() => toggleHabit(habit)} disabled={saving}>{todayLog ? 'Undo today' : 'Complete today'}</Button>}</div></div>
            </Card>
          )
        })}</div>}
      </>}
    </section>
  )
}

export function StudySessionsPage() {
  const loader = useCallback(async () => {
    const [topics, sessions, summary] = await Promise.all([get('/topics'), get('/study-sessions'), get('/study-sessions/summary/by-subject')])
    return { topics, sessions, summary }
  }, [])
  const { data, loading, error, refresh } = useRemoteState(loader)
  const { saving, notice, error: mutationError, run } = useMutation(refresh)
  const [topicId, setTopicId] = useState('')
  const [timerStatus, setTimerStatus] = useState('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [manualDate, setManualDate] = useState(localDate())
  const [manualTime, setManualTime] = useState('09:00')
  const [manualMinutes, setManualMinutes] = useState(30)
  const segmentStartedAt = useRef(0)
  const sessionStartedAt = useRef('')
  const elapsedBeforePause = useRef(0)

  useEffect(() => {
    if (timerStatus !== 'running') return undefined
    const timer = window.setInterval(() => {
      setElapsedSeconds(elapsedBeforePause.current + Math.floor((Date.now() - segmentStartedAt.current) / 1000))
    }, 250)
    return () => window.clearInterval(timer)
  }, [timerStatus])

  const selectedTopic = useMemo(() => data?.topics.find((topic) => String(topic.id) === String(topicId)), [data?.topics, topicId])
  function startTimer() {
    if (!topicId) return
    const now = new Date()
    if (timerStatus === 'idle') {
      sessionStartedAt.current = now.toISOString()
      elapsedBeforePause.current = 0
    }
    segmentStartedAt.current = Date.now()
    setTimerStatus('running')
  }
  function pauseTimer() {
    elapsedBeforePause.current += Math.floor((Date.now() - segmentStartedAt.current) / 1000)
    setElapsedSeconds(elapsedBeforePause.current)
    setTimerStatus('paused')
  }
  async function endTimer() {
    const seconds = timerStatus === 'running'
      ? elapsedBeforePause.current + Math.floor((Date.now() - segmentStartedAt.current) / 1000)
      : elapsedBeforePause.current
    if (seconds < 1) return
    const started = new Date(sessionStartedAt.current)
    const ended = new Date()
    const success = await run(() => create('/study-sessions', {
      topic_id: Number(topicId),
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_minutes: Math.max(1, Math.round(seconds / 60)),
      session_date: localDate(started),
    }), 'Study session saved.')
    if (success) resetTimer()
  }
  function resetTimer() {
    setTimerStatus('idle')
    setElapsedSeconds(0)
    elapsedBeforePause.current = 0
    sessionStartedAt.current = ''
  }
  async function addManualSession(event) {
    event.preventDefault()
    const started = new Date(`${manualDate}T${manualTime}:00`)
    const ended = new Date(started.getTime() + Number(manualMinutes) * 60000)
    const success = await run(() => create('/study-sessions', {
      topic_id: Number(topicId),
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      duration_minutes: Number(manualMinutes),
      session_date: manualDate,
    }), 'Manual session added.')
    if (success) setManualMinutes(30)
  }
  const formattedTime = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`

  return (
    <section className="academic-page">
      <PageHeader title="Study sessions" description="Focus on a topic, track the time you actually study, and review your session history." icon={Clock3} />
      <PageFeedback loading={loading} error={error} onDismiss={refresh} />
      {!loading && !error && <>
        {(notice || mutationError) && <div className={mutationError ? 'feature-error feature-inline-error' : 'feature-success'} role={mutationError ? 'alert' : 'status'}>{notice || mutationError}</div>}
        {!data.topics.length ? <EmptyState title="Add a topic to get started" detail="Create a syllabus subject, unit, and topic before recording a study session." /> : <>
          <div className="session-layout">
            <Card className="timer-card"><div className="feature-card-heading"><div><h2>Focus timer</h2><p>Pick a topic, then start when you’re ready.</p></div><div className="timer-heading-icon"><Clock3 size={18} /></div></div>
              <label className="field-label">Study topic<select value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={timerStatus !== 'idle'}><option value="">Select a topic</option>{data.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
              <div className="timer-display" aria-live="polite">{formattedTime}</div>
              <div className="timer-topic-label">{selectedTopic?.title || 'Your focus time starts here'}</div>
              <div className="timer-controls">{timerStatus === 'running' ? <Button variant="secondary" icon={Pause} onClick={pauseTimer}>Pause</Button> : <Button icon={timerStatus === 'paused' ? Play : Play} onClick={startTimer} disabled={!topicId}>{timerStatus === 'paused' ? 'Resume' : 'Start session'}</Button>}{timerStatus !== 'idle' && <Button variant="secondary" icon={Square} onClick={endTimer} disabled={saving || elapsedSeconds < 1}>{saving ? 'Saving…' : 'End & save'}</Button>}{timerStatus !== 'idle' && <button className="quiet-action" onClick={resetTimer}>Discard</button>}</div>
              <p className="timer-note">Pausing keeps the active study duration accurate. Saving a session does not complete its topic.</p>
            </Card>
            <Card className="manual-session-card"><div className="feature-card-heading"><div><h2>Add a past session</h2><p>Log study time you completed offline.</p></div><Activity size={18} className="muted-purple-icon" /></div>
              <form className="manual-session-form" onSubmit={addManualSession}><label className="field-label">Date<Input required type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} /></label><label className="field-label">Start time<Input required type="time" value={manualTime} onChange={(event) => setManualTime(event.target.value)} /></label><label className="field-label">Minutes studied<Input required type="number" min="1" max="1440" value={manualMinutes} onChange={(event) => setManualMinutes(event.target.value)} /></label><Button type="submit" icon={Plus} disabled={!topicId || saving}>Add session</Button></form>
            </Card>
          </div>
          <Card className="history-card"><div className="feature-card-heading"><div><h2>Session history</h2><p>Saved sessions are kept as a study record.</p></div></div>
            <div className="summary-list">{data.summary.map((summary) => <div key={summary.subject_id}><strong>{summary.subject_name}</strong><span>{summary.session_count} sessions</span><b>{formatMinutes(summary.total_minutes)}</b></div>)}</div>
            {!data.sessions.length ? <EmptyState title="No saved sessions" detail="Finish a timer session or add a past session to see your history." /> : <div className="session-history-list">{data.sessions.map((session) => {
              const topic = data.topics.find((item) => item.id === session.topic_id)
              return <div className="session-history-row" key={session.id}><span className="session-history-icon"><Clock3 size={15} /></span><span className="session-history-topic"><strong>{topic?.title || 'Study topic'}</strong><small>{session.session_date} · {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><b>{formatMinutes(session.duration_minutes)}</b></div>
            })}</div>}
          </Card>
        </>}
      </>}
    </section>
  )
}

export function PlannerPage() {
  const loader = useCallback(async () => {
    const [topics, plans] = await Promise.all([get('/topics'), get('/study-plans')])
    return { topics, plans }
  }, [])
  const { data, loading, error, refresh } = useRemoteState(loader)
  const { saving, notice, error: mutationError, run } = useMutation(refresh)
  const [form, setForm] = useState({ topic_id: '', plan_date: localDate(), planned_minutes: 45, priority: 'MEDIUM' })
  async function addPlan(event) {
    event.preventDefault()
    const success = await run(() => create('/study-plans', { ...form, topic_id: Number(form.topic_id), planned_minutes: Number(form.planned_minutes) }), 'Study plan item added.')
    if (success) setForm({ ...form, topic_id: '' })
  }
  async function setPlanStatus(plan, status) {
    await run(() => update(`/study-plans/${plan.id}`, { status }), `Plan marked ${status.toLowerCase()}.`)
  }

  return (
    <section className="academic-page">
      <PageHeader title="Daily study plan" description="Choose a topic, set aside realistic time, and track what you completed or skipped." icon={Target} />
      <PageFeedback loading={loading} error={error} onDismiss={refresh} />
      {!loading && !error && <>
        {(notice || mutationError) && <div className={mutationError ? 'feature-error feature-inline-error' : 'feature-success'} role={mutationError ? 'alert' : 'status'}>{notice || mutationError}</div>}
        {!data.topics.length ? <EmptyState title="A topic makes a good plan" detail="Add a subject, unit, and topic in Syllabus to start planning study time." /> : <Card className="feature-form-card"><div className="feature-card-heading"><div><h2>Plan a study task</h2><p>Plans are independent of topic completion and study sessions.</p></div></div><form className="form-grid planner-form" onSubmit={addPlan}><label>Topic<select required value={form.topic_id} onChange={(event) => setForm({ ...form, topic_id: event.target.value })}><option value="">Choose a topic</option>{data.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label><label>Date<Input required type="date" value={form.plan_date} onChange={(event) => setForm({ ...form, plan_date: event.target.value })} /></label><label>Minutes<Input required type="number" min="1" max="1440" value={form.planned_minutes} onChange={(event) => setForm({ ...form, planned_minutes: event.target.value })} /></label><label>Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><Button type="submit" icon={Plus} disabled={saving}>{saving ? 'Saving…' : 'Add to plan'}</Button></form></Card>}
        <Card className="history-card planner-list-card"><div className="feature-card-heading"><div><h2>Planned tasks</h2><p>Upcoming and previous study plan items.</p></div></div>
          {!data.plans.length ? <EmptyState title="Your plan is clear" detail="Add a study task above to make a plan for a topic." /> : <div className="planner-list">{data.plans.map((plan) => {
            const topic = data.topics.find((item) => item.id === plan.topic_id)
            return <div className="planner-row" key={plan.id}><div className="planner-date"><strong>{formatPlanDate(plan.plan_date)}</strong><small>{plan.plan_date}</small></div><div className="planner-topic"><strong>{topic?.title || 'Study topic'}</strong><span>{plan.planned_minutes} min · {plan.priority.toLowerCase()} priority</span></div><span className={`plan-status status-${plan.status.toLowerCase()}`}>{plan.status}</span>{plan.status === 'PLANNED' && <div className="planner-actions"><button className="quiet-action" onClick={() => setPlanStatus(plan, 'COMPLETED')} disabled={saving}><Check size={13} /> Complete</button><button className="quiet-action" onClick={() => setPlanStatus(plan, 'SKIPPED')} disabled={saving}>Skip</button></div>}</div>
          })}</div>}
        </Card>
      </>}
    </section>
  )
}

function EmptyState({ title, detail }) {
  return <div className="empty-state"><div><Target size={19} /></div><strong>{title}</strong><span>{detail}</span></div>
}

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (!hours) return `${remaining} min`
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`
}

function formatPlanDate(value) {
  const date = new Date(`${value}T00:00:00`)
  const today = localDate()
  const tomorrow = dateOffset(1)
  if (value === today) return 'Today'
  if (value === tomorrow) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
