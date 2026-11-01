const { KNOWLEDGE_THRESHOLDS } = require('./knowledgeConfidence')

function readThreshold(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError('Knowledge thresholds must be numbers between 0 and 100.')
  }
  return parsed
}

function getKnowledgeThresholds(overrides = {}) {
  const needsAttentionBelow = readThreshold(
    overrides.needsAttentionBelow ?? process.env.KNOWLEDGE_NEEDS_ATTENTION_BELOW,
    KNOWLEDGE_THRESHOLDS.needsAttentionBelow,
  )
  const reinforcementBelow = readThreshold(
    overrides.reinforcementBelow ?? process.env.KNOWLEDGE_REINFORCEMENT_BELOW,
    KNOWLEDGE_THRESHOLDS.reinforcementBelow,
  )
  if (reinforcementBelow < needsAttentionBelow) {
    throw new RangeError('Knowledge reinforcement threshold must be at least the needs-attention threshold.')
  }
  return { needsAttentionBelow, reinforcementBelow }
}

module.exports = { getKnowledgeThresholds }
