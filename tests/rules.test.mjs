import { test } from 'node:test'
import assert from 'node:assert'
import { aggregateConversation, analyzeMessage } from '../src/safety/rules.js'
import { CASES } from './dataset.mjs'

const HIGH_THRESHOLD = 35

for (const c of CASES) {
  test(`case: ${c.name}`, () => {
    const msgs = c.messages.map((m, i) => ({ id: `m${i}`, sender_id: m.from === 'me' ? 'me' : 'them', text: m.text, created_at: new Date().toISOString() }))
    const result = aggregateConversation(msgs)
    const flagged = result.suspiciousCount > 0 || result.riskScore >= 20
    if (c.expectedRisk === 'high') {
      assert.ok(flagged, `${c.name}: expected high risk, got score=${result.riskScore} level=${result.riskLevel}`)
    } else {
      assert.ok(!flagged, `${c.name}: expected low risk but got score=${result.riskScore} level=${result.riskLevel} cats=${result.categories}`)
    }
  })
}

test('analyzeMessage returns structured output', () => {
  const r = analyzeMessage('Share the OTP now')
  assert.ok(typeof r.score === 'number')
  assert.ok(Array.isArray(r.flags))
  assert.ok(Array.isArray(r.categories))
})
