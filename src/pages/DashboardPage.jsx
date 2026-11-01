import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Brain,
  CalendarClock,
  Check,
  Clock3,
  Flame,
  GraduationCap,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Button, Card } from '../components/ui'
import { get } from '../lib/api'

const DashboardCharts = lazy(() => import('./DashboardCharts'))

function localDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function duration(minutes) {
  if (!minutes) return '0 min'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder} min`
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function dueLabel(date, today) {
  if (date === today) return 'Today'
  const difference = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  return difference === 1 ? 'Tomorrow' : `In ${difference} days`
}

function statusLabel(status) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
}

export function DashboardPage({ onQuickAdd }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await get('/dashboard'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    get('/dashboard').then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <section className="dashboard-page integrated-dashboard">
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR STUDY OVERVIEW</div>
          <h1>Your academic dashboard</h1>
          <p>Progress and study patterns from your recorded StudySignal activity.</p>
        </div>
        <div className="heading-actions">
          {data?.demo_data_active && <span className="demo-label"><span /> INCLUDES DEMO DATA</span>}
          <Button onClick={onQuickAdd}>Plan a session</Button>
        </div>
      </div>

      {error && <Card className="dashboard-error" role="alert">
        <AlertCircle size={17} />
        <span><strong>Dashboard data could not be loaded.</strong><small>{error}</small></span>
        <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Retry</Button>
      </Card>}

      {loading ? <DashboardSkeleton /> : data && !error ? (
        <>
          {data.demo_data_active && <div className="dashboard-demo-note"><Activity size={14} /> Demo dataset is active. Figures include records labelled as demo data.</div>}
          <SectionHeading title="Academic overview" subtitle={`Live academic indicators · ${localDate(data.as_of_date)}`} />
          <div className="dashboard-health-grid">
            <OverviewMetric icon={Target} label="Syllabus completion" value={data.overview.syllabus.completion_percent == null ? '—' : `${data.overview.syllabus.completion_percent}%`} detail={`${data.overview.syllabus.completed_topics} of ${data.overview.syllabus.total_topics} topics`} href="/syllabus" />
            <OverviewMetric icon={Brain} label="Knowledge evidence" value={data.overview.knowledge.average_evidence_score == null ? '—' : `${data.overview.knowledge.average_evidence_score}%`} detail={data.overview.knowledge.average_evidence_score == null ? 'No scored assessments yet' : `Across ${data.overview.knowledge.verified_topics} assessed topics`} href="/knowledge" />
            <OverviewMetric icon={TrendingUp} label="Academic drift" value={data.overview.drift.time_drift_percentage == null ? '—' : `${data.overview.drift.time_drift_percentage}%`} detail={`${data.overview.drift.task_drift_percentage == null ? 'Task drift unavailable' : `${data.overview.drift.task_drift_percentage}% task drift`} · this week`} href="/analytics" />
            <OverviewMetric icon={Flame} label="Habit consistency" value={data.overview.habits.consistency_percent == null ? '—' : `${data.overview.habits.consistency_percent}%`} detail={`${data.overview.habits.completed_check_ins} of ${data.overview.habits.expected_check_ins} scheduled check-ins`} href="/habits" />
          </div>

          <SectionHeading title="Academic signals" subtitle="Things to keep in view, based on your records" />
          <div className="dashboard-signals-grid">
            <Card className="dashboard-signal-card debt-signal">
              <SignalHeading icon={Activity} title="Academic debt" link="/analytics" />
              <strong className="signal-number">{data.signals.debt.total_debt_points}<small> pts</small></strong>
              <span className="signal-caption">{data.signals.debt.overdue_task_count} overdue tasks · {data.signals.debt.skipped_task_count} skipped · {data.signals.debt.overdue_revision_count} revisions</span>
              <p>{data.signals.debt.disclaimer}</p>
            </Card>
            <Card className="dashboard-signal-card">
              <SignalHeading icon={Brain} title="Knowledge gaps" link="/knowledge" />
              {data.signals.knowledge_gaps.length ? <div className="dashboard-mini-list">{data.signals.knowledge_gaps.map((topic) => <a href="/knowledge" key={topic.id}><span>{topic.title}</span><small>{topic.subject_name} · {topic.latest_assessment?.evidence_score == null ? 'declining' : `${topic.latest_assessment.evidence_score}%`}</small></a>)}</div> : <InlineEmpty text="No scored or declining knowledge gaps identified." />}
            </Card>
            <Card className="dashboard-signal-card">
              <SignalHeading icon={CalendarClock} title="Revision queue" link="/knowledge" />
              {data.signals.overdue_revisions.length || data.signals.upcoming_revisions.length ? <div className="dashboard-mini-list">
                {[...data.signals.overdue_revisions, ...data.signals.upcoming_revisions].slice(0, 4).map((task) => (
                  <a href="/knowledge" key={`revision-${task.id}`}><span>{task.topic_title}</span><small>{task.subject_name} · {task.due_date < data.as_of_date ? `Overdue · ${localDate(task.due_date)}` : dueLabel(task.due_date, data.as_of_date)}</small></a>
                ))}
              </div> : <InlineEmpty text="No revisions due or overdue in the next 7 days." />}
            </Card>
            <Card className="dashboard-signal-card">
              <SignalHeading icon={GraduationCap} title="Upcoming exams" link="/forecast" />
              {data.signals.upcoming_exams.length ? <div className="dashboard-mini-list">{data.signals.upcoming_exams.map((exam) => (
                <a href="/forecast" key={exam.subject_id}><span>{exam.subject_name}</span><small>{localDate(exam.exam_date)} · {exam.days_until_exam === 0 ? 'Today' : `${exam.days_until_exam} days left`}</small></a>
              ))}</div> : <InlineEmpty text="No upcoming exam dates. Add one in Syllabus to see a forecast." />}
            </Card>
          </div>

          <div className="dashboard-feature-grid">
            <Card className="dashboard-panel">
              <PanelHeading icon={Clock3} title="Today's plan" subtitle="Scheduled work and recorded time" link="/planner" linkLabel="Open plan" />
              <div className="today-plan-summary">
                <div><small>Planned</small><strong>{duration(data.today.planned_minutes)}</strong></div>
                <div><small>Completed study time</small><strong>{duration(data.today.completed_minutes)}</strong></div>
                <div><small>Tasks</small><strong>{data.today.completed_tasks}/{data.today.planned_tasks}</strong></div>
              </div>
              {data.today.tasks.length ? <div className="dashboard-plan-list">{data.today.tasks.map((task) => (
                <div className="dashboard-plan-row" key={task.id}>
                  <span className={`dashboard-task-status task-${task.status.toLowerCase()}`}>{task.status === 'COMPLETED' ? <Check size={13} /> : null}</span>
                  <span className="dashboard-plan-copy"><strong>{task.topic_title}</strong><small>{task.subject_name} · {duration(task.planned_minutes)}</small></span>
                  <span className={`dashboard-status-label task-label-${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span>
                </div>
              ))}</div> : <InlineEmpty text="No study tasks scheduled for today." action="Create a plan" href="/planner" />}
            </Card>
            <Card className="dashboard-panel dashboard-habit-panel">
              <PanelHeading icon={Flame} title="Habit activity" subtitle="Today's routines and the last 14 days" link="/habits" linkLabel="Manage habits" />
              <div className="habit-summary-strip">
                <div><Flame size={15} /><strong>{data.habits.active_streak_count}</strong><span>active streaks</span></div>
                <div><strong>{data.habits.weekly_completion_percent == null ? '—' : `${data.habits.weekly_completion_percent}%`}</strong><span>weekly check-ins</span></div>
              </div>
              {data.habits.today.length ? <div className="dashboard-today-habits">{data.habits.today.slice(0, 5).map((habit) => (
                <div key={habit.id} className={habit.completed_today ? 'dashboard-habit-done' : ''}>
                  <span className="habit-check-mark">{habit.completed_today ? <Check size={12} /> : null}</span>
                  <span>{habit.name}</span><small>{habit.frequency.toLowerCase()}</small>
                </div>
              ))}</div> : <InlineEmpty text="Create a habit to begin tracking daily activity." action="Create a habit" href="/habits" />}
              <div className="dashboard-heatmap" role="img" aria-label="Habit completion heatmap for the last 14 days">
                {data.habits.heatmap.map((day) => <span key={day.date} title={`${day.date}: ${day.completed_habits} of ${day.scheduled_habits} scheduled habits`} className={heatmapTone(day.completion_percent)} />)}
              </div>
              <div className="heatmap-labels"><span>{localDate(data.habits.heatmap[0].date)}</span><span>Today</span></div>
            </Card>
          </div>

          <SectionHeading title="Study analytics" subtitle={`Week to date · ${localDate(data.analytics.week.from)}–${localDate(data.analytics.week.to)}`} />
          <div className="dashboard-analytics-summary">
            <Card><small>Weekly study hours</small><strong>{data.analytics.weekly_study_hours}<span> hrs</span></strong><span>{duration(data.analytics.weekly_study_minutes)} of recorded sessions</span></Card>
            <Card><small>Study sessions</small><strong>{data.analytics.weekly_session_count}</strong><span>Logged this week</span></Card>
            <Card><small>Assessment attempts</small><strong>{data.analytics.assessment_trend.reduce((total, day) => total + day.assessment_count, 0)}</strong><span>With evidence scores shown in trend</span></Card>
          </div>
          <Suspense fallback={<ChartSkeleton />}><DashboardCharts data={data.analytics} /></Suspense>

          <div className="dashboard-feature-grid">
            <Card className="dashboard-panel recommendations-panel">
              <PanelHeading icon={Target} title="Smart recommendations" subtitle="The next actions suggested by your study records" link="/recovery" linkLabel="Recovery planner" />
              {data.recommendations.length ? <div className="dashboard-recommendations">{data.recommendations.map((recommendation, index) => (
                <div className="dashboard-recommendation" key={`${recommendation.topic_id}-${recommendation.action}`}>
                  <span className="recommendation-position">0{index + 1}</span>
                  <div className="recommendation-content">
                    <div className="recommendation-title-row"><strong>{recommendation.topic_name}</strong><span>{recommendation.priority_score} priority</span></div>
                    <small>{recommendation.subject_name} · {statusLabel(recommendation.action)} · {duration(recommendation.estimated_minutes)}</small>
                    <p>{recommendation.reason}</p>
                    <a href="/syllabus">Open syllabus <ArrowRight size={13} /></a>
                  </div>
                </div>
              ))}</div> : <InlineEmpty text="No study recommendations are available from the current records." action="Review recovery planner" href="/recovery" />}
              <p className="dashboard-disclaimer">{data.recommendation_disclaimer}</p>
            </Card>
            <Card className="dashboard-panel forecast-panel">
              <PanelHeading icon={GraduationCap} title="Exam forecast" subtitle="Completion estimates from recorded topic history" link="/forecast" linkLabel="Open forecast" />
              {data.signals.upcoming_exams.length ? <div className="dashboard-forecast-list">{data.signals.upcoming_exams.slice(0, 3).map((forecast) => (
                <div className="dashboard-forecast-row" key={forecast.subject_id}>
                  <div className="forecast-title"><strong>{forecast.subject_name}</strong><span>{forecast.days_until_exam} days remaining</span></div>
                  <div className="forecast-details"><span>{forecast.current_topics_per_day == null ? 'Pace unavailable' : `${forecast.current_topics_per_day.toFixed(2)} topics/day`}</span><span>{forecast.projected_completion_date ? `Projected ${localDate(forecast.projected_completion_date)}` : 'Completion date unavailable'}</span></div>
                  <span className={`forecast-status forecast-${forecast.status.toLowerCase().replaceAll('_', '-')}`}>{statusLabel(forecast.status)}</span>
                  {forecast.remaining_topics > 0 && forecast.status === 'INSUFFICIENT_DATA' && <small className="forecast-limitation">Not enough study history to calculate a forecast.</small>}
                </div>
              ))}</div> : <InlineEmpty text="Add an upcoming exam date to a subject to see its completion forecast." action="Set exam dates" href="/syllabus" />}
            </Card>
          </div>
        </>
      ) : !error ? <Card className="dashboard-empty-state"><GraduationCap size={24} /><h2>Your StudySignal dashboard</h2><p>Add a subject, some topics, and a study habit to see your real academic overview here.</p><a href="/syllabus">Start with your syllabus <ArrowRight size={14} /></a></Card> : null}
    </section>
  )
}

function DashboardSkeleton() {
  return <div className="dashboard-loading" aria-label="Loading dashboard" aria-busy="true">
    <div className="dashboard-health-grid">{Array.from({ length: 4 }, (_, index) => <Card className="dashboard-skeleton-card" key={index}><span /><span /><span /></Card>)}</div>
    <div className="dashboard-signals-grid">{Array.from({ length: 4 }, (_, index) => <Card className="dashboard-skeleton-card dashboard-skeleton-tall" key={index}><span /><span /><span /><span /></Card>)}</div>
    <div className="dashboard-feature-grid">{Array.from({ length: 2 }, (_, index) => <Card className="dashboard-skeleton-card dashboard-skeleton-tall" key={index}><span /><span /><span /><span /></Card>)}</div>
  </div>
}

function SectionHeading({ title, subtitle }) {
  return <div className="dashboard-section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
}

function OverviewMetric({ icon: Icon, label, value, detail, href }) {
  return <Card className="dashboard-overview-card">
    <div className="overview-metric-icon"><Icon size={16} /></div>
    <small>{label}</small>
    <strong>{value}</strong>
    <span>{detail}</span>
    <a href={href}>View details <ArrowRight size={12} /></a>
  </Card>
}

function SignalHeading({ icon: Icon, title, link }) {
  return <div className="dashboard-signal-heading"><span><Icon size={15} /></span><strong>{title}</strong><a href={link} aria-label={`View ${title}`}><ArrowRight size={13} /></a></div>
}

function PanelHeading({ icon: Icon, title, subtitle, link, linkLabel }) {
  return <div className="dashboard-panel-heading">
    <div className="panel-heading-icon"><Icon size={15} /></div>
    <div className="panel-heading-copy"><h3>{title}</h3><p>{subtitle}</p></div>
    <a href={link}>{linkLabel} <ArrowRight size={12} /></a>
  </div>
}

function InlineEmpty({ text, action, href }) {
  return <div className="dashboard-inline-empty"><span>{text}</span>{action && <a href={href}>{action} <ArrowRight size={12} /></a>}</div>
}

function ChartSkeleton() {
  return <div className="dashboard-chart-grid" aria-label="Loading analytics charts" aria-busy="true">
    {Array.from({ length: 3 }, (_, index) => <Card className={`dashboard-panel chart-panel ${index === 2 ? 'chart-panel-wide' : ''}`} key={index}><div className="dashboard-chart-placeholder" /></Card>)}
  </div>
}

function heatmapTone(percent) {
  if (percent == null) return 'heatmap-none'
  if (percent === 0) return 'heatmap-zero'
  if (percent < 40) return 'heatmap-low'
  if (percent < 80) return 'heatmap-medium'
  return 'heatmap-high'
}
