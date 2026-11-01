import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, CheckCircle2, Clock3, GraduationCap, Info, TrendingUp } from 'lucide-react'
import { Button, Card, Input } from '../components/ui'
import { get } from '../lib/api'

export function ForecastPage() {
  const [subjectId, setSubjectId] = useState('')
  const [targetRate, setTargetRate] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ targetTopicsPerDay: String(targetRate) })
      if (subjectId) query.set('subjectId', subjectId)
      setData(await get(`/forecast?${query}`))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [subjectId, targetRate])

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ targetTopicsPerDay: String(targetRate) })
    if (subjectId) query.set('subjectId', subjectId)
    get(`/forecast?${query}`).then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [subjectId, targetRate])

  const forecast = useMemo(() => (
    data?.forecasts.find((item) => String(item.subject_id) === subjectId) || data?.forecasts[0] || null
  ), [data, subjectId])

  function formatDate(value) {
    if (!value) return 'Unavailable'
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  }

  return (
    <section className="academic-page forecast-page">
      <div className="page-heading academic-page-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div><h1><TrendingUp size={23} /> Exam outcome simulator</h1><p>Estimate syllabus completion from recorded topic completions—not exam marks.</p></div>
      </div>
      {error && <Card className="feature-error forecast-error" role="alert"><AlertCircle size={16} />{error}<Button variant="secondary" onClick={refresh}>Try again</Button></Card>}
      {loading ? <Card className="feature-state feature-loading"><span className="loading-spinner" />Calculating a transparent forecast…</Card> : data && !error && <>
        {!data.forecasts.length ? <Card className="recovery-empty"><div><GraduationCap size={21} /></div><h2>No subjects to forecast</h2><p>Create a subject and add syllabus topics to see a completion estimate.</p></Card> : <>
          <div className="forecast-controls">
            <label>Subject<select aria-label="Forecast subject" value={forecast?.subject_id || ''} onChange={(event) => setSubjectId(event.target.value)}>{data.forecasts.map((item) => <option value={item.subject_id} key={item.subject_id}>{item.subject_name}</option>)}</select></label>
            <label className="scenario-rate-control">What-if target pace <span><Input type="number" aria-label="Target topics per day" min="0.1" max="100" step="0.1" value={targetRate} onChange={(event) => setTargetRate(Math.min(100, Math.max(0.1, Number(event.target.value) || 0.1)))} /> topics/day</span></label>
          </div>
          {forecast && <ForecastDetails forecast={forecast} formatDate={formatDate} targetRate={targetRate} onRateChange={setTargetRate} />}
        </>}
      </>}
    </section>
  )
}

function ForecastDetails({ forecast, formatDate, targetRate, onRateChange }) {
  const statusText = {
    ON_PROJECTED_SCHEDULE: 'On projected schedule',
    AT_RISK_OF_MISSING_DEADLINE: 'At risk of missing the deadline',
    INSUFFICIENT_DATA: 'Insufficient data',
  }[forecast.status]
  const statusClass = forecast.status.toLowerCase().replaceAll('_', '-')
  const chartScenarios = forecast.scenarios
  const maxDays = Math.max(1, ...chartScenarios.map((scenario) => scenario.estimated_completion_days))

  return <>
    <div className={`forecast-status-banner forecast-status-${statusClass}`}>
      {forecast.status === 'ON_PROJECTED_SCHEDULE' ? <CheckCircle2 size={17} /> : <Info size={17} />}
      <div><strong>{statusText}</strong><span>{forecast.status_reason}</span></div>
    </div>
    <div className="forecast-metric-grid">
      <ForecastMetric icon={CalendarClock} label="Exam countdown" value={forecast.days_until_exam == null ? 'Not set' : forecast.days_until_exam < 0 ? `${Math.abs(forecast.days_until_exam)} days ago` : `${forecast.days_until_exam} days`} detail={forecast.exam_date ? `Exam ${formatDate(forecast.exam_date)}` : 'Add an exam date to compare'} />
      <ForecastMetric icon={TrendingUp} label="Current study pace" value={forecast.current_topics_per_day == null ? 'Unavailable' : `${forecast.current_topics_per_day.toFixed(2)} topics/day`} detail={`${forecast.recent_completed_topics} topic${forecast.recent_completed_topics === 1 ? '' : 's'} completed in ${forecast.window_days} days`} />
      <ForecastMetric icon={GraduationCap} label="Remaining topics" value={forecast.remaining_topics} detail={`${forecast.completed_topics} currently completed`} />
      <ForecastMetric icon={Clock3} label="Projected completion" value={formatDate(forecast.projected_completion_date)} detail={forecast.estimated_completion_days == null ? 'Not enough study history to calculate a forecast.' : `${forecast.estimated_completion_days} days · ${forecast.estimated_buffer_days == null ? 'exam date unavailable' : `${forecast.estimated_buffer_days} buffer days`}`} />
    </div>

    {forecast.status === 'INSUFFICIENT_DATA' && forecast.remaining_topics > 0 && <Card className="forecast-insufficient"><Info size={16} /><span>Not enough study history to calculate a forecast.</span><small>Record topic completions; the baseline requires at least one topic completed in the 14-day window.</small></Card>}

    <Card className="scenario-chart-card">
      <div className="feature-card-heading"><div><h2>What-if simulator</h2><p>Change your daily topic target to recalculate immediately.</p></div><TrendingUp size={17} className="muted-purple-icon" /></div>
      <div className="scenario-chart">
        {chartScenarios.map((scenario, index) => (
          <div className="scenario-chart-row" key={`${scenario.label}-${scenario.target_topics_per_day}`}>
            <div className="scenario-chart-label"><strong>{scenario.label}</strong><small>{scenario.target_topics_per_day} topic{scenario.target_topics_per_day === 1 ? '' : 's'} / day</small></div>
            <div className="scenario-bar-track"><span className={`scenario-bar scenario-bar-${index % 3}`} style={{ width: `${forecast.remaining_topics ? Math.max(5, (scenario.estimated_completion_days / maxDays) * 100) : 0}%` }} /></div>
            <div className="scenario-chart-result"><strong>{scenario.estimated_completion_days} days</strong><small>{formatDate(scenario.projected_completion_date)}</small></div>
          </div>
        ))}
      </div>
      <div className="forecast-scenario-controls">
        <label htmlFor="forecast-rate-range">Target topics per day</label>
        <input id="forecast-rate-range" type="range" min="0.1" max="100" step="0.1" value={targetRate} onChange={(event) => onRateChange(Number(event.target.value))} />
        <span>{targetRate} / day</span>
      </div>
    </Card>

    <Card className="forecast-assumptions">
      <div><Info size={15} /><strong>Assumptions and limitations</strong></div>
      <ul>{forecast.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
      <span className="forecast-recorded-activity">Recent activity context: {forecast.recent_sessions} sessions · {forecast.recent_study_minutes} study minutes in the 14-day window.</span>
    </Card>
  </>
}

function ForecastMetric({ icon: Icon, label, value, detail }) {
  return <Card className="forecast-metric-card"><span className="forecast-metric-icon"><Icon size={16} /></span><small>{label}</small><strong>{value}</strong><span>{detail}</span></Card>
}
