const KNOWLEDGE_THRESHOLDS = Object.freeze({
  needsAttentionBelow: 50,
  reinforcementBelow: 70,
})

const COMPONENTS = Object.freeze([
  ['quiz_score', 0.6],
  ['recall_score', 0.25],
])

function confidenceToPercentage(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null
  return rating * 20
}

function calculateEvidenceScore(assessment) {
  const confidence = assessment.confidence_rating != null
    ? confidenceToPercentage(assessment.confidence_rating)
    : assessment.confidence
  const available = COMPONENTS
    .map(([key, weight]) => ({ key, weight, value: assessment[key] }))
    .filter((component) => component.value != null)
  if (confidence != null) available.push({ key: 'confidence_percentage', weight: 0.15, value: confidence })
  if (!available.some((component) => component.key === 'quiz_score' || component.key === 'recall_score')) {
    return { evidence_score: null, status: 'UNVERIFIED', available_components: [] }
  }

  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0)
  const weightedScore = available.reduce((sum, component) => sum + component.value * component.weight, 0)

  return {
    evidence_score: Math.round((weightedScore / totalWeight) * 10) / 10,
    status: 'SCORED',
    available_components: available.map((component) => component.key),
  }
}

function classifyEvidenceScore(score, thresholds = KNOWLEDGE_THRESHOLDS) {
  if (score == null) return 'UNVERIFIED'
  if (score < thresholds.needsAttentionBelow) return 'NEEDS_ATTENTION'
  if (score < thresholds.reinforcementBelow) return 'REQUIRES_REINFORCEMENT'
  return 'RELATIVELY_STRONG'
}

function normalizeAssessment(assessment, thresholds = KNOWLEDGE_THRESHOLDS) {
  const calculated = calculateEvidenceScore(assessment)
  return {
    ...assessment,
    ...calculated,
    classification: classifyEvidenceScore(calculated.evidence_score, thresholds),
  }
}

function compareAssessments(latest, previous, thresholds = KNOWLEDGE_THRESHOLDS) {
  if (!latest) return { latest: null, previous: null, change: null, trend: 'UNVERIFIED' }
  const latestResult = normalizeAssessment(latest, thresholds)
  const previousResult = previous ? normalizeAssessment(previous, thresholds) : null
  const change = latestResult.evidence_score == null || previousResult?.evidence_score == null
    ? null
    : Math.round((latestResult.evidence_score - previousResult.evidence_score) * 10) / 10
  return {
    latest: latestResult,
    previous: previousResult,
    change,
    trend: change == null ? 'UNVERIFIED' : change > 0 ? 'IMPROVING' : change < 0 ? 'DECLINING' : 'STABLE',
  }
}

module.exports = {
  KNOWLEDGE_THRESHOLDS,
  confidenceToPercentage,
  calculateEvidenceScore,
  classifyEvidenceScore,
  normalizeAssessment,
  compareAssessments,
}
