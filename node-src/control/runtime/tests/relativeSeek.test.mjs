import test from 'node:test'
import assert from 'node:assert/strict'
import { RelativeSeek } from '../relativeSeek.mjs'

const state = (position = 340, timestamp = Date.now()) => ({ state: 'paused', attributes: {
  media_position: position, media_content_id: 'episode', media_duration: 1200,
  media_position_updated_at: new Date(timestamp).toISOString(),
} })
test('fresh positions determine direction without extrapolation', () => {
  const seeks = new RelativeSeek()
  assert.throws(() => seeks.plan('player', state(340, 1000), 10, 1100, 1050), /stale/)
  for (const [delta, expected] of [[-10, 330], [10, 350]]) {
    const plan = seeks.plan('player', state(340, 1000), delta, 1000)
    assert.equal(plan.target, expected)
  }
})
test('successful commands require a new observed sample', () => {
  const seeks = new RelativeSeek()
  const now = Date.now()
  seeks.commit(seeks.plan('player', state(340, now), -10, now))
  assert.throws(() => seeks.plan('player', state(340, now), -10, now + 100), /stale/)
  assert.equal(seeks.plan('player', state(330, now + 1000), -10, now + 1000).target, 320)
})
test('stale command memory expires and missing positions are rejected', () => {
  const seeks = new RelativeSeek()
  assert.throws(() => seeks.plan('player', state(340, 1000), -10, 17000), /stale/)
  assert.throws(() => seeks.plan('player', state(null), 10))
})
