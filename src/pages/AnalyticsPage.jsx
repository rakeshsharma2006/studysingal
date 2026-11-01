import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Brain, CalendarDays, Clock3, Flame, TrendingDown } from 'lucide-react'
import { Card, Input, ProgressBar } from '../components/ui'
import { get } from '../lib/api'

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState('weekly')
  const [date, setDate] = useState(localDate())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period, date })
      setReport(await get(`/analytics/report?${query}`))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [period, date])

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ period, date })
    get(`/analytics/report?${query}`).then((result) => {
      if (active) setReport(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [period, date])

  return (
    <section className="academic-page analytics-page">
      <div className="page-heading academic-page-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div><h1><Activity size={23} /> Academic analytics</h1><p>Transparent study organization summaries, not judgments about you.</p></div>
        <div className="analytics-filters"><select aria-label="Report period" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select><Input aria-label="Report date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
      </div>
      {error && <Card className="feature-error" role="alert">{error}<button className="text-link" onClick={refresh}>Try again</button></Card>}
      {loading ? <Card className="feature-state feature-loading"><span className="loading-spinner" /> Calculating transparent summaries…</Card> : report && <>
        <div className="analytics-period-note"><CalendarDays size={14} />{report.drift.period === 'weekly' ? 'Weekly report' : 'Daily report'} · {report.drift.from} to {report.drift.to}</div>
        <div className="analytics-metric-grid">
          <AnalyticsMetric icon={Clock3} title="Time drift" value={formatPercent(report.drift.time_drift_percentage)} detail={`${report.drift.actual_minutes} of ${report.drift.planned_minutes} planned minutes`} />
          <AnalyticsMetric icon={CalendarDays} title="Task drift" value={formatPercent(report.drift.task_drift_percentage)} detail={`${report.drift.completed_tasks} of ${report.drift.planned_tasks} planned tasks completed`} />
          <AnalyticsMetric icon={AlertTriangle} title="Academic debt" value={`${report.debt.total_debt_points} pts`} detail={`${report.debt.overdue_task_count} overdue · ${report.debt.skipped_task_count} skipped · ${report.debt.overdue_revision_count} revisions`} />
          <AnalyticsMetric icon={Brain} title="Topics needing attention" value={`${report.knowledge.weak_topics.length}`} detail={`${report.knowledge.unverified_topics.length} unverified; unassessed topics are not marked failed`} />
        </div>

        <div className="analytics-grid">
          <Card className="analytics-detail-card">
            <div className="feature-card-heading"><div><h2>Planned vs actual</h2><p>Time and task drift stay separate.</p></div><TrendingDown size={17} className="muted-purple-icon" /></div>
            <div className="drift-comparison-row"><span>Study minutes</span><div><ProgressBar value={percentOf(report.drift.actual_minutes, report.drift.planned_minutes)} /></div><b>{report.drift.actual_minutes} / {report.drift.planned_minutes} min</b></div>
            <div className="drift-comparison-row"><span>Study tasks</span><div><ProgressBar value={percentOf(report.drift.completed_tasks, report.drift.planned_tasks)} /></div><b>{report.drift.completed_tasks} / {report.drift.planned_tasks}</b></div>
            <p className="analytics-explainer">A zero planned amount is reported as “Not available” rather than dividing by zero.</p>
          </Card>
          <Card className="analytics-detail-card">
            <div className="feature-card-heading"><div><h2>Academic debt breakdown</h2><p>Priority-weighted overdue work, capped at seven days.</p></div><AlertTriangle size={17} className="muted-purple-icon" /></div>
            {!report.debt.breakdown.length ? <div className="knowledge-empty-inline">No overdue or skipped tasks in this report.</div> : <div className="debt-breakdown-list">{report.debt.breakdown.slice(0, 8).map((item) => <div key={`${item.type}-${item.id}`}><span className="debt-item-type">{item.type.replaceAll('_', ' ').toLowerCase()}</span><strong>Topic #{item.topic_id}</strong><span>{item.overdue_days} day{item.overdue_days === 1 ? '' : 's'}</span><b>{item.debt_points} pts</b></div>)}</div>}
            <p className="analytics-explainer">{report.debt.disclaimer}{report.debt.oldest_overdue_task && ` Oldest due ${report.debt.oldest_overdue_task.due_date}.`}</p>
          </Card>
        </div>

        <div className="analytics-grid">
          <Card className="analytics-detail-card">
            <div className="feature-card-heading"><div><h2>Knowledge gaps</h2><p>Assessment history, not syllabus completion alone.</p></div><Brain size={17} className="muted-purple-icon" /></div>
            <div className="knowledge-analytics-stats"><span><strong>{report.knowledge.completed_topics_with_weak_evidence.length}</strong> completed with weak evidence</span><span><strong>{report.knowledge.declining_topics.length}</strong> declining trend</span><span><strong>{report.knowledge.topics_awaiting_revision.length}</strong> awaiting revision</span></div>
            {!report.knowledge.weak_topics.length && !report.knowledge.unverified_topics.length ? <div className="knowledge-empty-inline">No scored weak or unverified topics.</div> : <div className="debt-breakdown-list">{[...report.knowledge.weak_topics, ...report.knowledge.unverified_topics].slice(0, 8).map((topic) => <div key={topic.id}><span className={`knowledge-status-dot dot-${topic.classification.toLowerCase()}`} /><strong>{topic.title}</strong><span>{topic.classification.replaceAll('_', ' ').toLowerCase()}</span><b>{topic.latest_assessment?.evidence_score == null ? '—' : `${topic.latest_assessment.evidence_score}%`}</b></div>)}</div>}
            <p className="analytics-explainer">{report.knowledge.disclaimer}</p>
          </Card>
          <Card className="analytics-detail-card">
            <div className="feature-card-heading"><div><h2>Habit patterns</h2><p>Descriptive group comparisons; not causation.</p></div><Flame size={17} className="muted-purple-icon" /></div>
            {!report.habit_impact.length ? <div className="knowledge-empty-inline">No habit history to compare yet. Create a habit and log it regularly.</div> : <div className="habit-impact-list">{report.habit_impact.map((habit) => <div className="habit-impact-row" key={habit.habit_id}><strong>{habit.habit_name}</strong>{habit.enough_data ? <><span>{habit.completed_habit_days.observation_days} completion days vs {habit.other_days.observation_days} other days</span><div><b>{signed(habit.differences.average_study_minutes)} minutes</b><small>difference in average daily study time</small></div><div><b>{signed(habit.differences.average_sessions)} sessions</b><small>difference in average daily frequency</small></div>{habit.assessment_comparison_available && <div><b>{signed(habit.differences.average_assessment_score)} pts</b><small>difference in assessment score</small></div>}</> : <span className="insufficient-data">{habit.message}</span>}</div>)}</div>}
            <p className="analytics-explainer">Each comparison group needs at least five observation days. Assessment comparisons also require five scored assessment days in both groups.</p>
          </Card>
        </div>
      </>}
    </section>
  )
}

function AnalyticsMetric({ icon: Icon, title, value, detail }) {
  return <Card className="analytics-metric-card"><div className="analytics-metric-heading"><span><Icon size={16} /></span><strong>{title}</strong></div><b>{value}</b><small>{detail}</small></Card>
}

function formatPercent(value) {
  return value == null ? 'Not available' : `${value}%`
}

function percentOf(value, total) {
  return total ? Math.min(100, Math.round((value / total) * 100)) : 0
}

function signed(value) {
  return value > 0 ? `+${value}` : `${value}`
}
