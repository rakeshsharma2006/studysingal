const { getAcademicDrift } = require('./academicDrift')
const { getAcademicDebt } = require('./academicDebt')
const { getKnowledgeAnalysis } = require('./knowledgeGap')
const { getHabitImpact } = require('./habitImpact')

async function getAnalyticsReport(db, options = {}) {
  const [drift, debt, knowledge, habitImpact] = await Promise.all([
    getAcademicDrift(db, options),
    getAcademicDebt(db, options.today),
    getKnowledgeAnalysis(db, options),
    getHabitImpact(db, options),
  ])
  return { drift, debt, knowledge, habit_impact: habitImpact }
}

module.exports = { getAnalyticsReport }
