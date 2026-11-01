const { todayLocal } = require('../../utils/date')
const { getAcademicDrift, getReportRange } = require('../analytics/academicDrift')
const { getAcademicDebt } = require('../analytics/academicDebt')
const { getKnowledgeAnalysis } = require('../analytics/knowledgeGap')
const { calculateEvidenceScore } = require('../analytics/knowledgeConfidence')
const { getRecommendations } = require('../recovery/recommendationEngine')
const { getExamForecast, addCalendarDays } = require('../forecast/examForecast')

function listCalendarDays(from, to) {
  const dates = []
  for (let date = from; date <= to; date = addCalendarDays(date, 1)) dates.push(date)
  return dates
}

function isHabitScheduled(frequency, date) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  if (frequency === 'WEEKDAYS') return day >= 1 && day <= 5
  return frequency === 'DAILY'
}

function getCurrentStreak(dates, today) {
  const completed = new Set(dates)
  let date = completed.has(today) ? today : addCalendarDays(today, -1)
  if (!completed.has(date)) return 0
  let streak = 0
  while (completed.has(date)) {
    streak += 1
    date = addCalendarDays(date, -1)
  }
  return streak
}

async function getDashboardData(db, today = todayLocal()) {
  const week = getReportRange('weekly', today)
  const weekToDate = listCalendarDays(week.from, today)
  const heatmapDates = listCalendarDays(addCalendarDays(today, -13), today)
  const subjectProgress = (await db.prepare(`
    SELECT s.id, s.name, s.semester, s.exam_date,
      COUNT(t.id) AS total_topics,
      SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_topics
    FROM subjects s
    LEFT JOIN units u ON u.subject_id = s.id
    LEFT JOIN topics t ON t.unit_id = u.id
    GROUP BY s.id
    ORDER BY s.name COLLATE NOCASE
  `).all()).map((subject) => ({
    ...subject,
    completed_topics: subject.completed_topics || 0,
    progress_percent: subject.total_topics
      ? Math.round((subject.completed_topics / subject.total_topics) * 100)
      : 0,
  }))
  const knowledge = await getKnowledgeAnalysis(db, { today })
  const scoredTopics = knowledge.topics.filter((topic) => topic.latest_assessment?.evidence_score != null)
  const averageEvidenceScore = scoredTopics.length
    ? Math.round((scoredTopics.reduce((sum, topic) => sum + topic.latest_assessment.evidence_score, 0) / scoredTopics.length) * 10) / 10
    : null
  const totalTopics = subjectProgress.reduce((sum, subject) => sum + subject.total_topics, 0)
  const completedTopics = subjectProgress.reduce((sum, subject) => sum + subject.completed_topics, 0)
  const activeHabits = await db.prepare(`
    SELECT id, name, frequency FROM habits WHERE is_active = 1 ORDER BY name COLLATE NOCASE
  `).all()
  const logs = await db.prepare(`
    SELECT hl.habit_id, hl.log_date, hl.completed
    FROM habit_logs hl
    JOIN habits h ON h.id = hl.habit_id
    WHERE h.is_active = 1 AND hl.log_date BETWEEN ? AND ?
  `).all(heatmapDates[0], today)
  const logByHabitDate = new Map(logs.map((log) => [`${log.habit_id}:${log.log_date}`, Boolean(log.completed)]))
  let weeklyCompleted = 0
  let weeklyExpectedLogCount = 0
  for (const habit of activeHabits) {
    if (habit.frequency === 'WEEKLY') {
      weeklyExpectedLogCount += 1
      if (weekToDate.some((date) => logByHabitDate.get(`${habit.id}:${date}`))) weeklyCompleted += 1
      continue
    }
    for (const date of weekToDate) {
      if (!isHabitScheduled(habit.frequency, date)) continue
      weeklyExpectedLogCount += 1
      if (logByHabitDate.get(`${habit.id}:${date}`)) weeklyCompleted += 1
    }
  }
  const completedActivityDates = (await db.prepare(`
    SELECT DISTINCT log_date FROM habit_logs WHERE completed = 1 ORDER BY log_date
  `).all()).map((row) => row.log_date)
  const todayHabits = activeHabits.map((habit) => ({
    ...habit,
    completed_today: Boolean(logByHabitDate.get(`${habit.id}:${today}`)),
    scheduled_today: habit.frequency === 'WEEKLY'
      ? !weekToDate.some((date) => logByHabitDate.get(`${habit.id}:${date}`))
      : isHabitScheduled(habit.frequency, today),
  }))
  const habitHeatmap = heatmapDates.map((date) => {
    const scheduledHabits = activeHabits.filter((habit) => (
      isHabitScheduled(habit.frequency, date)
      || (habit.frequency === 'WEEKLY' && logByHabitDate.get(`${habit.id}:${date}`))
    ))
    const completed = scheduledHabits.filter((habit) => logByHabitDate.get(`${habit.id}:${date}`)).length
    return {
      date,
      completed_habits: completed,
      scheduled_habits: scheduledHabits.length,
      completion_percent: scheduledHabits.length ? Math.round((completed / scheduledHabits.length) * 100) : null,
    }
  })

  const todayPlans = await db.prepare(`
    SELECT sp.id, sp.topic_id, sp.plan_date, sp.planned_minutes, sp.priority, sp.status,
      t.title AS topic_title, s.id AS subject_id, s.name AS subject_name
    FROM study_plans sp
    JOIN topics t ON t.id = sp.topic_id
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    WHERE sp.plan_date = ?
    ORDER BY CASE sp.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, sp.id
  `).all(today)
  const todayStudy = await db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS actual_minutes,
      COUNT(*) AS session_count
    FROM study_sessions WHERE session_date = ?
  `).get(today)

  const dailyStudy = await db.prepare(`
    SELECT date AS study_date,
      COALESCE((SELECT SUM(sp.planned_minutes) FROM study_plans sp WHERE sp.plan_date = calendar.date), 0) AS planned_minutes,
      COALESCE((SELECT COUNT(*) FROM study_plans sp WHERE sp.plan_date = calendar.date), 0) AS planned_tasks,
      COALESCE((SELECT SUM(CASE WHEN sp.status = 'COMPLETED' THEN 1 ELSE 0 END) FROM study_plans sp WHERE sp.plan_date = calendar.date), 0) AS completed_tasks,
      COALESCE((SELECT SUM(ss.duration_minutes) FROM study_sessions ss WHERE ss.session_date = calendar.date), 0) AS actual_minutes,
      COALESCE((SELECT COUNT(*) FROM study_sessions ss WHERE ss.session_date = calendar.date), 0) AS session_count
    FROM (
      SELECT ? AS date
      UNION ALL SELECT ?
      UNION ALL SELECT ?
      UNION ALL SELECT ?
      UNION ALL SELECT ?
      UNION ALL SELECT ?
      UNION ALL SELECT ?
    ) calendar
    ORDER BY study_date
  `).all(...Array(7).fill(null).map((_, index) => addCalendarDays(today, index - 6)))
  const studySessionsBySubject = await db.prepare(`
    SELECT s.id AS subject_id, s.name AS subject_name,
      COALESCE(SUM(ss.duration_minutes), 0) AS total_minutes,
      COUNT(ss.id) AS session_count
    FROM subjects s
    LEFT JOIN units u ON u.subject_id = s.id
    LEFT JOIN topics t ON t.unit_id = u.id
    LEFT JOIN study_sessions ss ON ss.topic_id = t.id
      AND ss.session_date BETWEEN ? AND ?
    GROUP BY s.id
    ORDER BY total_minutes DESC, s.name COLLATE NOCASE
  `).all(week.from, today)
  const weeklyStudySummary = await db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS study_minutes, COUNT(*) AS session_count
    FROM study_sessions WHERE session_date BETWEEN ? AND ?
  `).get(week.from, today)
  const assessmentRows = await db.prepare(`
    SELECT id, topic_id, quiz_score, recall_score, confidence, confidence_rating, created_at
    FROM topic_assessments
    WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
    ORDER BY created_at, id
  `).all(week.from, today)
  const dailyAssessments = new Map()
  for (const assessment of assessmentRows) {
    const score = calculateEvidenceScore(assessment).evidence_score
    if (score == null) continue
    const date = assessment.created_at.slice(0, 10)
    const values = dailyAssessments.get(date) || []
    values.push(score)
    dailyAssessments.set(date, values)
  }
  const assessmentTrend = weekToDate.map((date) => {
    const values = dailyAssessments.get(date) || []
    return {
      date,
      assessment_count: values.length,
      average_evidence_score: values.length
        ? Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10
        : null,
    }
  })
  const revisionTasks = await db.prepare(`
    SELECT rt.id, rt.topic_id, rt.due_date, t.title AS topic_title,
      s.name AS subject_name
    FROM revision_tasks rt
    JOIN topics t ON t.id = rt.topic_id
    JOIN units u ON u.id = t.unit_id
    JOIN subjects s ON s.id = u.subject_id
    WHERE rt.status = 'PENDING' AND rt.due_date BETWEEN ? AND ?
    ORDER BY rt.due_date, rt.id
  `).all(today, addCalendarDays(today, 7))
  const [debt, drift, forecast, recommendations] = await Promise.all([
    getAcademicDebt(db, today),
    getAcademicDrift(db, { period: 'weekly', date: today }),
    getExamForecast(db, { today, targetTopicsPerDay: 1 }),
    getRecommendations(db, { today, limit: 3 }),
  ])
  const upcomingExams = forecast.forecasts
    .filter((item) => item.days_until_exam != null && item.days_until_exam >= 0)
    .sort((left, right) => left.days_until_exam - right.days_until_exam)
    .slice(0, 4)
  const knowledgeGaps = [...knowledge.weak_topics, ...knowledge.declining_topics]
  const uniqueKnowledgeGaps = [...new Map(knowledgeGaps.map((topic) => [topic.id, topic])).values()]

  return {
    as_of_date: today,
    demo_data_active: subjectProgress.some((subject) => subject.name.startsWith('Demo: '))
      || activeHabits.some((habit) => habit.name.startsWith('Demo: ')),
    overview: {
      syllabus: {
        total_topics: totalTopics,
        completed_topics: completedTopics,
        completion_percent: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : null,
      },
      knowledge: {
        average_evidence_score: averageEvidenceScore,
        verified_topics: scoredTopics.length,
        unverified_topics: knowledge.unverified_topics.length,
        weak_topics: knowledge.weak_topics.length,
      },
      drift: {
        time_drift_percentage: drift.time_drift_percentage,
        task_drift_percentage: drift.task_drift_percentage,
        planned_minutes: drift.planned_minutes,
        actual_minutes: drift.actual_minutes,
        planned_tasks: drift.planned_tasks,
        completed_tasks: drift.completed_tasks,
      },
      habits: {
        consistency_percent: weeklyExpectedLogCount ? Math.round((weeklyCompleted / weeklyExpectedLogCount) * 100) : null,
        completed_check_ins: weeklyCompleted,
        expected_check_ins: weeklyExpectedLogCount,
        active_habits: activeHabits.length,
      },
    },
    signals: {
      debt,
      knowledge_gaps: uniqueKnowledgeGaps.slice(0, 6),
      unverified_topics: knowledge.unverified_topics.slice(0, 4),
      overdue_revisions: knowledge.overdue_revision_tasks.slice(0, 6),
      upcoming_revisions: revisionTasks.slice(0, 6),
      upcoming_exams: upcomingExams,
    },
    today: {
      tasks: todayPlans,
      planned_minutes: todayPlans.reduce((sum, task) => sum + task.planned_minutes, 0),
      completed_minutes: todayStudy.actual_minutes,
      completed_session_count: todayStudy.session_count,
      planned_tasks: todayPlans.length,
      completed_tasks: todayPlans.filter((task) => task.status === 'COMPLETED').length,
    },
    habits: {
      today: todayHabits,
      weekly_completed_check_ins: weeklyCompleted,
      weekly_expected_check_ins: weeklyExpectedLogCount,
      weekly_completion_percent: weeklyExpectedLogCount ? Math.round((weeklyCompleted / weeklyExpectedLogCount) * 100) : null,
      current_streak: getCurrentStreak(completedActivityDates, today),
      heatmap: habitHeatmap,
    },
    analytics: {
      week: { from: week.from, to: today },
      weekly_study_hours: Math.round((weeklyStudySummary.study_minutes / 60) * 10) / 10,
      weekly_study_minutes: weeklyStudySummary.study_minutes,
      weekly_session_count: weeklyStudySummary.session_count,
      daily_study: dailyStudy,
      subject_duration: studySessionsBySubject,
      assessment_trend: assessmentTrend,
      recent_session_count: dailyStudy.reduce((sum, day) => sum + day.session_count, 0),
    },
    recommendations: recommendations.recommendations,
    recommendation_disclaimer: recommendations.disclaimer,
  }
}

module.exports = { listCalendarDays, isHabitScheduled, getCurrentStreak, getDashboardData }
