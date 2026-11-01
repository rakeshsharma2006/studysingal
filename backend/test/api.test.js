const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createApp } = require('../app')
const { createDatabase } = require('../database')
const { migrate } = require('../database/migrate')
const { todayLocal } = require('../utils/date')

test('all academic APIs validate input and preserve relational history', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studysignal-'))
  const db = createDatabase(path.join(directory, 'test.sqlite'))
  migrate(db)
  migrate(db)
  const server = createApp(db).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}/api`
  const today = todayLocal()
  const yesterday = new Date(`${today}T00:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayDate = yesterday.toISOString().slice(0, 10)

  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    db.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  test('syllabus CRUD edits all topic fields and preserves dependencies and recorded history', async (context) => {
    const db = createDatabase(':memory:')
    const server = createApp(db).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`
    context.after(async () => {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      db.close()
    })

    async function request(url, method = 'GET', body) {
      const response = await fetch(`${baseUrl}${url}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { response, payload: response.status === 204 ? null : await response.json() }
    }

    const subject = await request('/subjects', 'POST', { name: 'CRUD subject', semester: 'Fall' })
    const subjectId = subject.payload.data.id
    assert.equal((await request(`/subjects/${subjectId}`, 'PATCH', { name: 'Edited subject' })).payload.data.name, 'Edited subject')
    const unit = await request('/units', 'POST', { subject_id: subjectId, title: 'CRUD unit', position: 0 })
    const unitId = unit.payload.data.id
    assert.equal((await request(`/units/${unitId}`, 'PATCH', { title: 'Edited unit' })).payload.data.title, 'Edited unit')
    const topic = await request('/topics', 'POST', { unit_id: unitId, title: 'CRUD topic' })
    const topicId = topic.payload.data.id
    const editedTopic = await request(`/topics/${topicId}`, 'PATCH', {
      title: 'Edited topic',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      estimated_minutes: 90,
    })
    assert.deepEqual({
      title: editedTopic.payload.data.title,
      status: editedTopic.payload.data.status,
      priority: editedTopic.payload.data.priority,
      estimated_minutes: editedTopic.payload.data.estimated_minutes,
    }, {
      title: 'Edited topic',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      estimated_minutes: 90,
    })
    assert.equal((await request(`/units/${unitId}`, 'DELETE')).response.status, 409)
    assert.equal((await request(`/subjects/${subjectId}`, 'DELETE')).response.status, 409)

    const assessment = await request('/topic-assessments', 'POST', { topic_id: topicId, quiz_score: 80 })
    assert.equal(assessment.response.status, 201)
    assert.equal((await request(`/topics/${topicId}`, 'DELETE')).response.status, 409)

    const emptyTopic = await request('/topics', 'POST', { unit_id: unitId, title: 'Safe to delete' })
    assert.equal((await request(`/topics/${emptyTopic.payload.data.id}`, 'DELETE')).response.status, 204)
    assert.equal((await request(`/topics/${topicId}`, 'DELETE')).response.status, 409)
  })

  async function request(url, method = 'GET', body) {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { response, payload: response.status === 204 ? null : await response.json() }
  }

  const health = await request('/health')
  assert.equal(health.response.status, 200)
  assert.match(health.response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i)
  assert.equal(health.payload.data.database, 'connected')

  const missingRoute = await request('/not-a-route')
  assert.equal(missingRoute.response.status, 404)
  assert.equal(missingRoute.payload.error.code, 'NOT_FOUND')
  assert.equal(typeof missingRoute.payload.error.requestId, 'string')

  const malformedJson = await fetch(`${baseUrl}/subjects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  const malformedJsonPayload = await malformedJson.json()
  assert.equal(malformedJson.status, 400)
  assert.equal(malformedJsonPayload.error.code, 'INVALID_JSON')
  assert.equal(typeof malformedJsonPayload.error.requestId, 'string')

  const subject = await request('/subjects', 'POST', { name: 'Biology', semester: 'Fall 2026', exam_date: '2026-12-10' })
  assert.equal(subject.response.status, 201)
  const subjectId = subject.payload.data.id
  assert.equal((await request(`/subjects/${subjectId}`)).response.status, 200)
  assert.equal((await request(`/subjects/${subjectId}`, 'PATCH', { name: 'Biology II' })).payload.data.name, 'Biology II')
  const unit = await request('/units', 'POST', { subject_id: subjectId, title: 'Cell structure', position: 0 })
  assert.equal(unit.response.status, 201)
  const unitId = unit.payload.data.id
  assert.equal((await request(`/units/${unitId}`)).response.status, 200)
  assert.equal((await request(`/units/${unitId}`, 'PATCH', { title: 'Cell structure and function' })).payload.data.title, 'Cell structure and function')
  const topic = await request('/topics', 'POST', { unit_id: unitId, title: 'Cell membranes' })
  assert.equal(topic.response.status, 201)
  const topicId = topic.payload.data.id
  assert.equal((await request(`/topics/${topicId}`)).response.status, 200)

  const habit = await request('/habits', 'POST', { name: 'Daily review', frequency: 'DAILY' })
  assert.equal(habit.response.status, 201)
  const habitId = habit.payload.data.id
  assert.equal((await request(`/habits/${habitId}`)).response.status, 200)
  assert.equal((await request(`/habits/${habitId}`, 'PATCH', { name: 'Daily review habit' })).payload.data.name, 'Daily review habit')
  const log = await request('/habit-logs', 'POST', { habit_id: habitId, log_date: today, completed: true })
  assert.equal(log.response.status, 201)
  assert.equal((await request(`/habit-logs/${log.payload.data.id}`)).response.status, 200)
  assert.equal(typeof log.payload.data.completed, 'boolean')
  assert.equal((await request(`/topics/${topicId}`)).payload.data.status, 'NOT_STARTED')
  assert.equal((await request('/habit-logs', 'POST', { habit_id: habitId, log_date: today })).response.status, 409)
  assert.equal((await request(`/habit-logs/${log.payload.data.id}`, 'PATCH', { completed: false })).payload.data.completed, false)
  assert.equal((await request(`/habit-logs/${log.payload.data.id}`, 'PATCH', { completed: true })).payload.data.completed, true)

  const plan = await request('/study-plans', 'POST', { topic_id: topicId, plan_date: today, planned_minutes: 45 })
  assert.equal(plan.response.status, 201)
  assert.equal((await request(`/study-plans/${plan.payload.data.id}`)).response.status, 200)
  assert.equal((await request(`/study-plans/${plan.payload.data.id}`, 'PATCH', { status: 'COMPLETED' })).payload.data.status, 'COMPLETED')
  assert.equal((await request(`/topics/${topicId}`)).payload.data.status, 'NOT_STARTED')
  const session = await request('/study-sessions', 'POST', {
    topic_id: topicId,
    started_at: `${today}T10:00:00.000Z`,
    ended_at: `${today}T10:45:00.000Z`,
    duration_minutes: 45,
    session_date: today,
  })
  assert.equal(session.response.status, 201)
  assert.equal((await request(`/topics/${topicId}`)).payload.data.status, 'NOT_STARTED')
  assert.equal((await request(`/study-sessions/${session.payload.data.id}`)).response.status, 200)
  assert.equal((await request(`/study-sessions/${session.payload.data.id}`, 'PATCH', { duration_minutes: 40 })).payload.data.duration_minutes, 40)
  const assessment = await request('/topic-assessments', 'POST', { topic_id: topicId, quiz_score: 80, confidence: 75 })
  assert.equal(assessment.response.status, 201)
  assert.equal((await request(`/topic-assessments/${assessment.payload.data.id}`)).response.status, 200)
  assert.equal((await request(`/topic-assessments/${assessment.payload.data.id}`, 'PATCH', { confidence: 77 })).response.status, 405)
  const latestAssessment = await request(`/topics/${topicId}/assessments`, 'POST', {
    topic_id: topicId,
    quiz_score: 60,
    recall_score: 50,
    confidence_rating: 3,
  })
  assert.equal(latestAssessment.response.status, 201)
  assert.equal((await request(`/topics/${topicId}/assessments`)).payload.data.length, 2)
  assert.equal((await request('/topic-assessments')).payload.data.find((item) => item.id === latestAssessment.payload.data.id).evidence_score, 57.5)
  assert.equal((await request(`/topic-assessments/${latestAssessment.payload.data.id}`, 'DELETE')).response.status, 405)
  const revision = await request('/revision-tasks', 'POST', { topic_id: topicId, due_date: '2026-11-05' })
  assert.equal(revision.response.status, 201)
  assert.equal((await request(`/revision-tasks/${revision.payload.data.id}`)).response.status, 200)
  assert.equal((await request(`/revision-tasks/${revision.payload.data.id}`, 'PATCH', { status: 'COMPLETED' })).payload.data.status, 'COMPLETED')
  const overdueRevision = await request('/revision-tasks', 'POST', { topic_id: topicId, due_date: yesterdayDate })

  const subjectProgress = await request('/subjects/progress')
  assert.equal(subjectProgress.payload.data[0].progress_percent, 0)
  const updatedTopic = await request(`/topics/${topicId}`, 'PATCH', { status: 'COMPLETED' })
  assert.equal(updatedTopic.payload.data.status, 'COMPLETED')
  assert.equal(updatedTopic.payload.data.completed_at, today)
  assert.equal((await request('/subjects/progress')).payload.data[0].progress_percent, 100)
  assert.equal((await request('/study-sessions/summary/by-subject')).payload.data[0].total_minutes, 40)
  assert.equal((await request(`/topics/${topicId}`)).payload.data.status, 'COMPLETED')

  const history = await request(`/habits/${habitId}/history`)
  assert.equal(history.payload.data.current_streak, 1)
  assert.equal(history.payload.data.longest_streak, 1)
  assert.equal(history.payload.data.streak_unit, 'days')
  assert.equal((await request(`/subjects/${subjectId}/units`)).payload.data.length, 1)
  const knowledge = await request('/knowledge/analysis')
  assert.equal(knowledge.payload.data.topics[0].latest_assessment.evidence_score, 57.5)
  assert.equal(knowledge.payload.data.topics[0].trend, 'DECLINING')
  assert.equal((await request(`/topics/${topicId}/revisions`)).payload.data.length, 2)
  assert.equal((await request(`/revision-tasks/overdue?date=${today}`)).payload.data.length, 1)
  assert.equal((await request('/knowledge/analysis')).payload.data.overdue_revision_tasks.length, 1)
  assert.equal((await request(`/knowledge/analysis?needsAttentionBelow=70&reinforcementBelow=60`)).response.status, 400)
  const dailyDrift = await request(`/analytics/drift?period=daily&date=${today}`)
  assert.equal(dailyDrift.payload.data.planned_minutes, 45)
  assert.equal(dailyDrift.payload.data.actual_minutes, 40)
  assert.equal(dailyDrift.payload.data.completed_tasks, 1)
  const weeklyAnalytics = await request(`/analytics/report?period=weekly&date=${today}`)
  assert.equal(weeklyAnalytics.response.status, 200)
  assert.equal(weeklyAnalytics.payload.data.knowledge.topics.length, 1)
  assert.equal((await request('/analytics/habit-impact?days=1')).payload.data.length, 1)
  assert.equal((await request(`/analytics/drift?period=monthly&date=${today}`)).response.status, 400)
  assert.equal((await request(`/topics/${topicId}/assessments`, 'POST', {
    topic_id: topicId,
    confidence_rating: 6,
  })).response.status, 400)
  const confidenceUpdate = await request(`/topics/${topicId}/assessments`, 'POST', {
    topic_id: topicId,
    quiz_score: 60,
    recall_score: 50,
    confidence_rating: 4,
  })
  assert.equal(confidenceUpdate.response.status, 201)
  assert.equal((await request('/knowledge/analysis')).payload.data.topics[0].latest_assessment.evidence_score, 60.5)
  const unverifiedTopic = await request('/topics', 'POST', { unit_id: unitId, title: 'Confidence only' })
  const unverifiedAttempt = await request(`/topics/${unverifiedTopic.payload.data.id}/assessments`, 'POST', {
    topic_id: unverifiedTopic.payload.data.id,
    confidence_rating: 4,
  })
  assert.equal(unverifiedAttempt.response.status, 201)
  const updatedKnowledge = await request('/knowledge/analysis')
  assert.equal(updatedKnowledge.payload.data.topics.find((item) => item.id === unverifiedTopic.payload.data.id).classification, 'UNVERIFIED')
  assert.equal((await request('/topic-assessments', 'POST', { topic_id: topicId })).response.status, 400)
  assert.equal((await request(`/topics/${topicId}/assessments`, 'POST', {
    topic_id: topicId + 1,
    quiz_score: 80,
  })).response.status, 400)

  assert.equal((await request('/subjects', 'POST', { name: '', semester: '', exam_date: 'bad-date' })).response.status, 400)
  assert.equal((await request('/topics', 'POST', { unit_id: 9999, title: 'Orphan' })).response.status, 409)
  assert.equal((await request(`/topics/${topicId}`, 'PATCH', {})).response.status, 400)
  assert.equal((await request('/topic-assessments', 'POST', { topic_id: topicId, quiz_score: 120 })).response.status, 400)
  assert.equal((await request('/habit-logs?from=not-a-date')).response.status, 400)
  assert.equal((await request('/study-sessions?from=2026-11-03&to=2026-11-01')).response.status, 400)
  assert.equal((await request(`/subjects/${subjectId + 999}/units`)).response.status, 404)
  assert.equal((await request('/study-sessions', 'POST', {
    topic_id: topicId,
    started_at: `${today}T10:00:00`,
    ended_at: `${today}T10:30:00`,
    duration_minutes: 30,
    session_date: today,
  })).response.status, 400)
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
  assert.equal((await request(`/topics/${topicId}`, 'DELETE')).response.status, 409)
  assert.equal((await request(`/subjects/${subjectId}`, 'DELETE')).response.status, 409)
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM topic_assessments WHERE topic_id = ?').get(topicId).count, 3)

  for (const [url, id] of [
    ['/revision-tasks', revision.payload.data.id],
    ['/study-sessions', session.payload.data.id],
    ['/study-plans', plan.payload.data.id],
    ['/habit-logs', log.payload.data.id],
  ]) {
    assert.equal((await request(`${url}/${id}`, 'DELETE')).response.status, 204)
  }
  assert.equal((await request(`/topic-assessments/${assessment.payload.data.id}`, 'GET')).response.status, 200)
  assert.equal((await request(`/revision-tasks/${overdueRevision.payload.data.id}`, 'PATCH', {
    status: 'COMPLETED',
    recall_score: 72,
  })).response.status, 200)
  assert.equal((await request(`/habits/${habitId}`, 'PATCH', { is_active: false })).payload.data.is_active, false)

  const disposableSubject = (await request('/subjects', 'POST', { name: 'Disposable subject', semester: 'Test' })).payload.data
  const disposableUnit = (await request('/units', 'POST', { subject_id: disposableSubject.id, title: 'Disposable unit' })).payload.data
  const disposableTopic = (await request('/topics', 'POST', { unit_id: disposableUnit.id, title: 'Disposable topic' })).payload.data
  assert.equal((await request(`/topics/${disposableTopic.id}`, 'DELETE')).response.status, 204)
  assert.equal((await request(`/units/${disposableUnit.id}`, 'DELETE')).response.status, 204)
  assert.equal((await request(`/subjects/${disposableSubject.id}`, 'DELETE')).response.status, 204)
  assert.equal((await request(`/habits/${habitId}`, 'DELETE')).response.status, 204)
})
