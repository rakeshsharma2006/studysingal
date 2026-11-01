import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, BookOpen, Brain, CalendarClock, Clock3, Flame, RotateCcw, Target } from 'lucide-react'
import { Button, Card } from '../components/ui'
import { get } from '../lib/api'

const actionLabels = {
  STUDY_TOPIC: 'Study topic',
  COMPLETE_TOPIC: 'Complete topic',
  TAKE_KNOWLEDGE_ASSESSMENT: 'Take knowledge assessment',
  REVISE_TOPIC: 'Revise topic',
  PRACTICE_QUESTIONS: 'Practice questions',
}

const factorLabels = {
  exam_urgency: 'Exam urgency',
  knowledge_weakness: 'Knowledge weakness',
  syllabus_incompletion: 'Syllabus incompletion',
  revision_delay: 'Revision delay',
}

const factorIcons = {
  exam_urgency: CalendarClock,
  knowledge_weakness: Brain,
  syllabus_incompletion: BookOpen,
  revision_delay: RotateCcw,
}

export function RecoveryPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await get('/recovery/recommendations?limit=3'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    get('/recovery/recommendations?limit=3').then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <section className="academic-page recovery-page">
      <div className="page-heading academic-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div>
          <h1><Flame size={23} /> Academic recovery</h1>
          <p>What should you study next, and why? Ranked using your syllabus, assessments, revisions, and exam dates.</p>
        </div>
      </div>
      <Card className="recovery-intro"><Target size={17} /><span>Recommendations use a transparent, weighted rule system. They never change topic status or assume an unassessed topic is weak.</span></Card>
      {error && <Card className="feature-error recovery-error" role="alert"><AlertCircle size={16} />{error}<Button variant="secondary" onClick={load}>Try again</Button></Card>}
      {loading ? <Card className="feature-state feature-loading"><span className="loading-spinner" />Finding your next study action…</Card> : data && !error ? (
        data.recommendations.length ? (
          <div className="recovery-recommendation-list">
            {data.recommendations.slice(0, 3).map((recommendation, index) => (
              <RecommendationCard recommendation={recommendation} rank={index + 1} key={`${recommendation.topic_id}-${recommendation.action}`} />
            ))}
          </div>
        ) : <Card className="recovery-empty"><div><Target size={20} /></div><h2>No priority actions right now</h2><p>Add topics, assessments, exam dates, or revision tasks to generate recommendations from your study records.</p></Card>
      ) : null}
      {data && <div className="recovery-method-note"><strong>How ranking works</strong><span>Exam urgency 30% · Knowledge weakness 30% · Syllabus incompletion 25% · Revision delay 15%. Missing factors are excluded and the remaining weights are renormalized.</span><small>{data.disclaimer}</small></div>}
    </section>
  )
}

function RecommendationCard({ recommendation, rank }) {
  const level = recommendation.priority_level.toLowerCase()
  return (
    <Card className={`recovery-recommendation priority-${level}`}>
      <div className="recommendation-top">
        <span className={`recommendation-rank rank-${level}`}>0{rank}</span>
        <div className="recommendation-topic"><h2>{recommendation.topic_name}</h2><span>{recommendation.subject_name}{recommendation.exam_date ? ` · Exam ${recommendation.exam_date}` : ' · No exam date set'}</span></div>
        <div className="recommendation-score"><strong>{recommendation.priority_score}</strong><span>priority score</span></div>
      </div>
      <div className="recommendation-action-row">
        <span className={`recommendation-action action-${recommendation.action.toLowerCase()}`}>{actionLabels[recommendation.action]}</span>
        <span className="recommendation-duration"><Clock3 size={14} /> About {recommendation.estimated_minutes} min</span>
        <span className={`priority-indicator indicator-${level}`}>{recommendation.priority_level} priority</span>
      </div>
      <p className="recommendation-reason"><ArrowRight size={14} />{recommendation.reason}</p>
      <div className="recommendation-factors">
        {Object.entries(recommendation.factors).map(([key, factor]) => {
          const Icon = factorIcons[key]
          return (
            <div className={`recommendation-factor ${factor.score == null ? 'factor-unavailable' : ''}`} key={key}>
              <span><Icon size={13} />{factorLabels[key]}</span>
              <strong>{factor.score == null ? 'Unavailable' : `${factor.score}/100`}</strong>
              <small>{factor.weight == null ? 'Excluded from score' : `${factor.weight}% weight`}</small>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
