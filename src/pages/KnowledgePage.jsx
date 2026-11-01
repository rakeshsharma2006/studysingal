import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Brain, CalendarClock, Check, ChevronDown, ChevronUp, Clock3, Plus, Sparkles } from 'lucide-react'
import { Button, Card, Input } from '../components/ui'
import { create, get, update } from '../lib/api'

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function KnowledgePage() {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setAnalysis(await get('/knowledge/analysis'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    get('/knowledge/analysis').then((result) => {
      if (active) setAnalysis(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  async function submit(action, successMessage) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      await refresh()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="academic-page knowledge-page">
      <div className="page-heading academic-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> STUDYSIGNAL WORKSPACE</div>
          <h1><Brain size={23} /> Knowledge analysis</h1>
          <p>Separate topic completion from evidence of recall, assessment, and confidence.</p>
        </div>
      </div>
      <Card className="knowledge-disclaimer"><Sparkles size={16} /><span>Evidence scores summarize recorded study inputs. They are not scientifically validated measures of intelligence or mastery.</span></Card>
      {error && <Card className="feature-error knowledge-error" role="alert"><AlertCircle size={16} />{error}<button className="text-link" onClick={refresh}>Try again</button></Card>}
      {notice && <div className="feature-success" role="status"><Check size={15} />{notice}</div>}
      {loading ? <Card className="feature-state feature-loading"><span className="loading-spinner" /> Loading assessment history…</Card> : analysis && <>
        <div className="knowledge-summary-grid">
          <SummaryCard label="Strong topics" count={analysis.strong_topics.length} tone="strong" />
          <SummaryCard label="Need reinforcement" count={analysis.weak_topics.length} tone="weak" />
          <SummaryCard label="Unverified" count={analysis.unverified_topics.length} tone="unverified" />
          <SummaryCard label="Awaiting revision" count={analysis.topics_awaiting_revision.length} tone="revision" />
          <SummaryCard label="Overdue revisions" count={analysis.overdue_revision_tasks.length} tone="overdue" />
        </div>
        <div className="knowledge-threshold-note">Configurable thresholds · Needs attention below {analysis.thresholds.needsAttentionBelow}% · Reinforcement below {analysis.thresholds.reinforcementBelow}% · Strong at or above {analysis.thresholds.reinforcementBelow}%</div>

        <section className="knowledge-section">
          <div className="knowledge-section-heading"><div><h2>Topic evidence</h2><p>Every syllabus topic appears here, including those without an assessment.</p></div><span>{analysis.topics.length} topics</span></div>
          {!analysis.topics.length ? <EmptyKnowledgeState /> : <div className="knowledge-topic-list">{analysis.topics.map((topic) => (
            <TopicKnowledgeCard key={topic.id} topic={topic} saving={saving} onSubmit={submit} />
          ))}</div>}
        </section>

        <div className="knowledge-lower-grid">
          <Card className="knowledge-trends-card">
            <div className="feature-card-heading"><div><h2>Recent assessment trends</h2><p>Latest recorded assessment attempts</p></div><ActivityMark /></div>
            {!analysis.recent_assessments.length ? <div className="knowledge-empty-inline">No assessments recorded yet. An unassessed topic is unverified, not failed.</div> : <div className="recent-assessment-list">{analysis.recent_assessments.map((assessment) => (
              <div className="recent-assessment-row" key={assessment.id}>
                <span className={`knowledge-status-dot dot-${assessment.classification.toLowerCase()}`} />
                <span className="recent-assessment-title"><strong>{assessment.topic_title}</strong><small>{new Date(assessment.created_at).toLocaleString()}</small></span>
                <b>{assessment.evidence_score == null ? 'UNVERIFIED' : `${assessment.evidence_score}%`}</b>
                <TrendIcon trend={assessment.classification} />
              </div>
            ))}</div>}
          </Card>
          <Card className="knowledge-reinforcement-card">
            <div className="feature-card-heading"><div><h2>Topics to revisit</h2><p>Weak evidence and revisions due</p></div><CalendarClock size={17} className="muted-purple-icon" /></div>
            {!analysis.weak_topics.length && !analysis.topics_awaiting_revision.length
              ? <div className="knowledge-empty-inline">Nothing is waiting for reinforcement right now.</div>
              : <div className="reinforcement-list">{[...new Map([...analysis.weak_topics, ...analysis.topics_awaiting_revision].map((topic) => [topic.id, topic])).values()].map((topic) => (
                <div className="reinforcement-row" key={topic.id}><span className={`knowledge-status-dot dot-${topic.classification.toLowerCase()}`} /><span><strong>{topic.title}</strong><small>{topic.subject_name} · {topic.classification.replaceAll('_', ' ').toLowerCase()}</small></span><span>{topic.latest_assessment?.evidence_score == null ? 'Unverified' : `${topic.latest_assessment.evidence_score}%`}</span></div>
              ))}</div>}
          </Card>
        </div>
        {analysis.overdue_revision_tasks.length > 0 && <Card className="overdue-revisions-card"><div className="feature-card-heading"><div><h2>Overdue revisions</h2><p>Pending revisions past their scheduled date</p></div><CalendarClock size={17} className="muted-purple-icon" /></div><div className="overdue-revision-list">{analysis.overdue_revision_tasks.map((task) => <div key={task.id}><strong>{task.topic_title}</strong><span>{task.subject_name}</span><b>Due {task.due_date}</b></div>)}</div></Card>}
      </>}
    </section>
  )
}

function SummaryCard({ label, count, tone }) {
  return <Card className="knowledge-summary-card"><span className={`summary-mark summary-mark-${tone}`} /><span className="knowledge-summary-count">{count}</span><strong>{label}</strong></Card>
}

function ActivityMark() {
  return <div className="card-heading-icon"><Clock3 size={15} /></div>
}

function EmptyKnowledgeState() {
  return <div className="empty-state"><div><Brain size={19} /></div><strong>No topics to assess yet</strong><span>Add subjects, units, and topics in Syllabus. Assessment evidence will appear here as it is recorded.</span></div>
}

function TopicKnowledgeCard({ topic, saving, onSubmit }) {
  const [quizScore, setQuizScore] = useState('')
  const [recallScore, setRecallScore] = useState('')
  const [confidenceRating, setConfidenceRating] = useState('')
  const [updatedConfidence, setUpdatedConfidence] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assessmentHistory, setAssessmentHistory] = useState(null)
  const [revisionHistory, setRevisionHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [revisionDate, setRevisionDate] = useState(localDate())
  const [recallByRevision, setRecallByRevision] = useState('')
  const latest = topic.latest_assessment
  const previous = topic.previous_assessment
  const score = latest?.evidence_score

  async function toggleHistory() {
    if (!historyOpen) {
      setHistoryLoading(true)
      setHistoryError('')
      try {
        const [attempts, revisions] = await Promise.all([
          get(`/topics/${topic.id}/assessments`),
          get(`/topics/${topic.id}/revisions`),
        ])
        setAssessmentHistory(attempts)
        setRevisionHistory(revisions)
      } catch (requestError) {
        setHistoryError(requestError.message)
      } finally {
        setHistoryLoading(false)
      }
    }
    setHistoryOpen((open) => !open)
  }

  function recordAssessment(event) {
    event.preventDefault()
    const body = {}
    if (quizScore !== '') body.quiz_score = Number(quizScore)
    if (recallScore !== '') body.recall_score = Number(recallScore)
    if (confidenceRating !== '') body.confidence_rating = Number(confidenceRating)
    if (!Object.keys(body).length) return
    onSubmit(() => create(`/topics/${topic.id}/assessments`, { topic_id: topic.id, ...body }), 'Assessment attempt saved.')
      .then((saved) => {
        if (saved) {
          setQuizScore('')
          setRecallScore('')
          setConfidenceRating('')
          setAssessmentHistory(null)
          setRevisionHistory(null)
          setHistoryOpen(false)
        }
      })
  }

  function updateConfidence(event) {
    event.preventDefault()
    if (!updatedConfidence) return
    const body = {
      topic_id: topic.id,
      confidence_rating: Number(updatedConfidence),
    }
    if (latest?.quiz_score != null) body.quiz_score = latest.quiz_score
    if (latest?.recall_score != null) body.recall_score = latest.recall_score
    onSubmit(() => create(`/topics/${topic.id}/assessments`, body), 'Confidence update saved as a new assessment attempt.')
      .then((saved) => {
        if (saved) {
          setUpdatedConfidence('')
          setAssessmentHistory(null)
          setHistoryOpen(false)
        }
      })
  }

  async function createRevision(event) {
    event.preventDefault()
    const saved = await onSubmit(() => create('/revision-tasks', {
      topic_id: topic.id,
      due_date: revisionDate,
      status: 'PENDING',
    }), 'Revision scheduled.')
    if (saved) {
      setAssessmentHistory(null)
      setRevisionHistory(null)
      setHistoryOpen(false)
    }
  }

  async function completeRevision(task) {
    const saved = await onSubmit(() => update(`/revision-tasks/${task.id}`, {
      status: 'COMPLETED',
      ...(recallByRevision === '' ? {} : { recall_score: Number(recallByRevision) }),
    }), 'Revision marked complete.')
    if (saved) {
      setAssessmentHistory(null)
      setRevisionHistory(null)
      setHistoryOpen(false)
      setRecallByRevision('')
    }
  }

  return (
    <Card className="knowledge-topic-card">
      <div className="knowledge-topic-header">
        <span className={`knowledge-status-dot dot-${topic.classification.toLowerCase()}`} />
        <div className="knowledge-topic-title"><h3>{topic.title}</h3><span>{topic.subject_name} · {topic.unit_title} · {topic.status.replaceAll('_', ' ').toLowerCase()}</span></div>
        <div className="knowledge-topic-score">{score == null ? <strong>UNVERIFIED</strong> : <><strong>{score}%</strong><span>{topic.classification.replaceAll('_', ' ').toLowerCase()}</span></>}</div>
        {topic.trend === 'DECLINING' && <span className="declining-pill"><ArrowDownRight size={13} /> Declining</span>}
        {topic.trend === 'IMPROVING' && <span className="improving-pill"><ArrowUpRight size={13} /> Improving</span>}
        {topic.overdue_revisions.length > 0 && <span className="declining-pill">Overdue revision</span>}
      </div>
      {latest && <div className="latest-assessment-strip">
        <span>{formatInput('Quiz', latest.quiz_score)}</span>
        <span>{formatInput('Recall', latest.recall_score)}</span>
        <span>{formatInput('Confidence', latest.confidence_rating ? `${latest.confidence_rating}/5` : latest.confidence != null ? `${latest.confidence}%` : null)}</span>
        {previous && <span className="score-comparison">Previous {previous.evidence_score == null ? 'UNVERIFIED' : `${previous.evidence_score}%`} {topic.score_change != null && `· ${topic.score_change > 0 ? '+' : ''}${topic.score_change} pts`}</span>}
      </div>}
      <form className="assessment-form" onSubmit={recordAssessment}>
        <label>Quiz score<Input type="number" min="0" max="100" step="1" placeholder="0–100" value={quizScore} onChange={(event) => setQuizScore(event.target.value)} /></label>
        <label>Recall score<Input type="number" min="0" max="100" step="1" placeholder="0–100" value={recallScore} onChange={(event) => setRecallScore(event.target.value)} /></label>
        <label>Confidence<select value={confidenceRating} onChange={(event) => setConfidenceRating(event.target.value)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5 · {rating * 20}%</option>)}</select></label>
        <Button type="submit" icon={Plus} disabled={saving || (!quizScore && !recallScore && !confidenceRating)}>{saving ? 'Saving…' : 'Record assessment'}</Button>
      </form>
      {latest && <form className="confidence-update-form" onSubmit={updateConfidence}>
        <label>Update confidence rating<select value={updatedConfidence} onChange={(event) => setUpdatedConfidence(event.target.value)}><option value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select></label>
        <Button type="submit" variant="secondary" disabled={saving || !updatedConfidence}>Save as new attempt</Button>
      </form>}
      <div className="topic-management-actions">
        <button className="text-link" onClick={toggleHistory}>{historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{historyOpen ? 'Hide history' : `Assessment & revision history (${topic.assessment_count})`}</button>
        <form className="revision-create-form" onSubmit={createRevision}><Input aria-label={`Next revision date for ${topic.title}`} type="date" required value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} /><Button type="submit" variant="secondary" icon={CalendarClock} disabled={saving}>Schedule revision</Button></form>
      </div>
      {historyOpen && <div className="topic-history-panel">
        {historyLoading ? <span className="history-loading">Loading history…</span> : historyError ? <div className="feature-error" role="alert">{historyError}<button className="text-link" onClick={async () => {
          setHistoryLoading(true)
          setHistoryError('')
          try {
            const [attempts, revisions] = await Promise.all([
              get(`/topics/${topic.id}/assessments`),
              get(`/topics/${topic.id}/revisions`),
            ])
            setAssessmentHistory(attempts)
            setRevisionHistory(revisions)
          } catch (requestError) {
            setHistoryError(requestError.message)
          } finally {
            setHistoryLoading(false)
          }
        }}>Retry</button></div> : <>
          <div className="topic-history-column"><strong>Assessment attempts</strong>{assessmentHistory?.length ? assessmentHistory.map((attempt) => <div className="history-record" key={attempt.id}><span>{new Date(attempt.created_at).toLocaleString()}</span><b>{attempt.quiz_score == null && attempt.recall_score == null ? 'UNVERIFIED' : `${attemptScore(attempt)}%`}</b><small>Quiz {formatInput('', attempt.quiz_score)} · Recall {formatInput('', attempt.recall_score)} · Confidence {attempt.confidence_rating ? `${attempt.confidence_rating}/5` : '—'}</small></div>) : <span className="knowledge-empty-inline">No assessment attempts recorded.</span>}</div>
          <div className="topic-history-column"><strong>Revision history</strong>{revisionHistory?.length ? revisionHistory.map((task) => <div className="history-record revision-history-record" key={task.id}><span>Due {task.due_date} · {task.status}</span>{task.status === 'PENDING' ? <div className="revision-complete-inline"><Input aria-label={`Recall score for revision ${task.id}`} type="number" min="0" max="100" placeholder="Recall 0–100" value={recallByRevision} onChange={(event) => setRecallByRevision(event.target.value)} /><Button variant="secondary" onClick={() => completeRevision(task)} disabled={saving}><Check size={13} /> Complete</Button></div> : <small>Completed {task.completed_at || '—'}{task.recall_score == null ? '' : ` · Recall ${task.recall_score}%`}</small>}</div>) : <span className="knowledge-empty-inline">No revision tasks yet.</span>}</div>
        </>}
      </div>}
    </Card>
  )
}

function formatInput(label, value) {
  return value == null ? `${label ? `${label} ` : ''}—` : `${label ? `${label} ` : ''}${value}${label === 'Confidence' ? '' : '%'}`.trim()
}

function attemptScore(attempt) {
  const quiz = attempt.quiz_score
  const recall = attempt.recall_score
  const confidence = attempt.confidence_rating ? attempt.confidence_rating * 20 : attempt.confidence
  if (quiz == null && recall == null) return null
  const components = [[quiz, 0.6], [recall, 0.25], [confidence, 0.15]].filter(([value]) => value != null)
  const totalWeight = components.reduce((total, [, weight]) => total + weight, 0)
  return Math.round(components.reduce((total, [value, weight]) => total + value * weight, 0) / totalWeight * 10) / 10
}

function TrendIcon({ trend }) {
  if (trend === 'NEEDS_ATTENTION' || trend === 'REQUIRES_REINFORCEMENT') return <ArrowDownRight className="trend-down-icon" size={15} />
  if (trend === 'RELATIVELY_STRONG') return <ArrowUpRight className="trend-up-icon" size={15} />
  return <span className="trend-unverified-mark">—</span>
}
