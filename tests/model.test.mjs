import assert from 'node:assert/strict'
import test from 'node:test'

function calculateCapacity(checkin) {
  const available = checkin.physical + checkin.cognitive + checkin.emotional + checkin.sensory + checkin.social
  const recoveryPenalty = Math.max(0, checkin.recovery - 1) * 4
  return Math.max(30, Math.min(100, Math.round((available / 25) * 100 - recoveryPenalty)))
}

test('capacity stays inside the supported planning range', () => {
  assert.equal(calculateCapacity({ physical: 1, cognitive: 1, emotional: 1, sensory: 1, social: 1, recovery: 5 }), 30)
  assert.equal(calculateCapacity({ physical: 5, cognitive: 5, emotional: 5, sensory: 5, social: 5, recovery: 1 }), 100)
})

test('higher recovery need lowers otherwise equal available capacity', () => {
  const base = { physical: 4, cognitive: 4, emotional: 4, sensory: 4, social: 4 }
  assert.ok(calculateCapacity({ ...base, recovery: 1 }) > calculateCapacity({ ...base, recovery: 5 }))
})
