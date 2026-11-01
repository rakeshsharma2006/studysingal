const { getAcademicDrift } = require('./academicDrift')
const { getAcademicDebt } = require('./academicDebt')
const { getKnowledgeAnalysis } = require('./knowledgeGap')
const { getHabitImpact } = require('./habitImpact')

function getAnalyticsReport(db, options = {}) {
  return {
    drift: getAcademicDrift(db, options),
    debt: getAcademicDebt(db, options.today),
    knowledge: getKnowledgeAnalysis(db, options),
    habit_impact: getHabitImpact(db, options),
  }
}

module.exports = { getAnalyticsReport }
