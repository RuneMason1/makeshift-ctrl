export class RelativeSeek {
  constructor() { this.positions = new Map() }

  plan(entityId, state, delta, now = Date.now(), requestedAt = 0) {
    const a = state?.attributes ?? {}
    const position = a.media_position
    if (!['playing', 'paused'].includes(state?.state) ||
        typeof position !== 'number' || !Number.isFinite(position) ||
        !Number.isFinite(delta)) throw new Error('No usable playback position for relative seek')
    const identity = JSON.stringify([a.media_content_id, a.media_title, a.media_duration])
    const prior = this.positions.get(entityId)
    // Only observed recent samples may anchor an absolute seek. A successful
    // request is not evidence that the player reached its requested target.
    const sampleAt = Date.parse(a.media_position_updated_at ?? '')
    if (!Number.isFinite(sampleAt) || sampleAt < requestedAt || sampleAt > now || now - sampleAt > 2000 ||
        (prior && sampleAt <= prior.at)) throw new Error('Playback position is stale; seek withheld')
    const reuse = false
    const base = position
    const duration = typeof a.media_duration === 'number' && a.media_duration > 0
      ? a.media_duration : Infinity
    return { entityId, identity, reported: position, at: now,
      target: Math.max(0, Math.min(duration, base + delta)), reused: Boolean(reuse) }
  }

  commit(plan) { this.positions.set(plan.entityId, { ...plan, at: Date.now() }) }
  clear() { this.positions.clear() }
}
