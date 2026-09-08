export function normalizeCarouselSession(session) {
  const id = String(session?.id ?? '')
  const dial = Number(session?.input?.dial)
  const button = Number(session?.input?.button)
  const items = Array.isArray(session?.items) ? session.items : []
  if (!/^[a-z][a-z0-9-]*$/i.test(id)) throw new Error('Carousel sessions require a safe id')
  if (!Number.isInteger(dial) || dial < 0 || dial > 3 || !Number.isInteger(button) || button < 0 || button > 15) {
    throw new Error('Carousel sessions require an explicit valid dial and button')
  }
  if (items.length < 1 || items.length > 64) throw new Error('Carousel sessions require 1 to 64 items')
  const itemIds = new Set()
  const normalizedItems = items.map(item => {
    const itemId = String(item?.itemId ?? '')
    if (!/^[A-Za-z0-9._-]{1,12}$/.test(itemId) || itemIds.has(itemId)) {
      throw new Error('Carousel item ids must be unique ASCII values up to 12 characters')
    }
    itemIds.add(itemId)
    return Object.freeze({ ...item, itemId, title: String(item?.title ?? itemId) })
  })
  return Object.freeze({
    id,
    input: Object.freeze({ dial, button }),
    items: Object.freeze(normalizedItems),
    resetArtwork: typeof session.resetArtwork === 'function' ? session.resetArtwork : undefined,
    loadArtwork: typeof session.loadArtwork === 'function' ? session.loadArtwork : undefined,
    activate: typeof session.activate === 'function' ? session.activate : undefined,
    preload: typeof session.preload === 'function' ? session.preload : undefined,
  })
}

export class CarouselSessionCoordinator {
  constructor() {
    this.active = null
    this.opening = null
    this.generation = 0
  }

  clear() {
    this.generation++
    this.active = null
    this.opening = null
  }

  isActive(session) {
    return this.active === session
  }

  async open(candidate, send) {
    const normalized = normalizeCarouselSession(candidate)
    const key = `${normalized.id}:${normalized.input.dial}:${normalized.input.button}`
    if (this.opening?.key === key) return this.opening.promise

    const generation = ++this.generation
    this.active = null
    const session = Object.freeze({ ...normalized, wireSessionId: generation >>> 0 || 1 })
    const isCurrent = () => generation === this.generation
    const promise = Promise.resolve(send({ session, isCurrent })).then(result => {
      if (result !== false && isCurrent()) this.active = session
      return isCurrent() ? session : undefined
    })
    this.opening = { key, promise }
    try {
      return await promise
    } finally {
      if (this.opening?.promise === promise) this.opening = null
    }
  }
}
