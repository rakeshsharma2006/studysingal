const { z } = require('zod')
const { isValidDate } = require('../utils/date')

const date = z.string().refine(isValidDate, 'Date must be a valid YYYY-MM-DD calendar date.')
const timestamp = z.iso.datetime({ offset: true })
const optionalDate = date.nullable().optional()
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH'])
const topicStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
const taskStatus = z.enum(['PLANNED', 'COMPLETED', 'SKIPPED'])
const score = z.number().min(0).max(100).nullable()
const text = (max) => z.string().trim().min(1).max(max)

const createSchemas = {
  subjects: z.object({
    name: text(100),
    semester: text(50),
    exam_date: optionalDate,
  }),
  units: z.object({
    subject_id: z.number().int().positive(),
    title: text(150),
    position: z.number().int().min(0).default(0),
  }),
  topics: z.object({
    unit_id: z.number().int().positive(),
    title: text(180),
    status: topicStatus.default('NOT_STARTED'),
    priority: priority.default('MEDIUM'),
    estimated_minutes: z.number().int().min(1).max(1440).default(30),
    completed_at: optionalDate,
  }),
  habits: z.object({
    name: text(120),
    frequency: z.enum(['DAILY', 'WEEKDAYS', 'WEEKLY']).default('DAILY'),
    is_active: z.boolean().default(true),
  }),
  habit_logs: z.object({
    habit_id: z.number().int().positive(),
    log_date: date,
    completed: z.boolean().default(true),
  }),
  study_plans: z.object({
    topic_id: z.number().int().positive(),
    plan_date: date,
    planned_minutes: z.number().int().min(1).max(1440),
    priority: priority.default('MEDIUM'),
    status: taskStatus.default('PLANNED'),
  }),
  study_sessions: z.object({
    topic_id: z.number().int().positive(),
    started_at: timestamp,
    ended_at: timestamp,
    duration_minutes: z.number().int().min(1).max(1440),
    session_date: date,
  }).refine((value) => Date.parse(value.ended_at) >= Date.parse(value.started_at), {
    path: ['ended_at'],
    message: 'Session end must not be before its start.',
  }),
  topic_assessments: z.object({
    topic_id: z.number().int().positive(),
    quiz_score: score.optional(),
    recall_score: score.optional(),
    confidence: score.optional(),
    confidence_rating: z.number().int().min(1).max(5).optional(),
  }).refine((value) => (
    value.quiz_score !== undefined
    || value.recall_score !== undefined
    || value.confidence !== undefined
    || value.confidence_rating !== undefined
  ), 'Provide at least one assessment input.')
    .refine((value) => !(value.confidence !== undefined && value.confidence_rating !== undefined), {
      path: ['confidence_rating'],
      message: 'Provide confidence as a rating or a legacy percentage, not both.',
    }),
  revision_tasks: z.object({
    topic_id: z.number().int().positive(),
    due_date: date,
    status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED']).default('PENDING'),
    completed_at: optionalDate,
    recall_score: score.optional(),
  }),
}

const updateSchemas = Object.fromEntries(
  Object.entries(createSchemas).map(([name, schema]) => {
    const updateShape = Object.fromEntries(
      Object.entries(schema.shape).map(([key, field]) => [
        key,
        typeof field.removeDefault === 'function' ? field.removeDefault() : field,
      ]),
    )
    let updateSchema = z.object(updateShape).partial()
    if (name === 'study_sessions') {
      updateSchema = updateSchema.refine((value) => (
        !value.started_at || !value.ended_at || Date.parse(value.ended_at) >= Date.parse(value.started_at)
      ), {
        path: ['ended_at'],
        message: 'Session end must not be before its start.',
      })
    }
    return [name, updateSchema.refine((value) => Object.keys(value).length > 0, 'At least one field must be provided.')]
  }),
)

const idParams = z.object({ id: z.coerce.number().int().positive() })
const parentParams = (name) => z.object({ [`${name}Id`]: z.coerce.number().int().positive() })
const dateRange = z.object({
  from: date.optional(),
  to: date.optional(),
  date: date.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  path: ['to'],
  message: 'The to date must not be before the from date.',
})
const collectionDateFilters = z.object({
  from: date.optional(),
  to: date.optional(),
  date: date.optional(),
  habit_id: z.coerce.number().int().positive().optional(),
  topic_id: z.coerce.number().int().positive().optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  path: ['to'],
  message: 'The to date must not be before the from date.',
})
const analyticsQuery = z.object({
  period: z.enum(['daily', 'weekly']).optional(),
  date: date.optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  needsAttentionBelow: z.coerce.number().min(0).max(100).optional(),
  reinforcementBelow: z.coerce.number().min(0).max(100).optional(),
}).refine((value) => (
  value.needsAttentionBelow === undefined
  || value.reinforcementBelow === undefined
  || value.reinforcementBelow >= value.needsAttentionBelow
), {
  path: ['reinforcementBelow'],
  message: 'Reinforcement threshold must be at least the needs-attention threshold.',
})

module.exports = {
  createSchemas,
  updateSchemas,
  idParams,
  parentParams,
  dateRange,
  collectionDateFilters,
  analyticsQuery,
}
