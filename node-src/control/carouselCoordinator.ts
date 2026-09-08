export type CarouselItem = Readonly<{
  itemId: string
  title: string
}>

export type CarouselSession = Readonly<{
  id: string
  connectionId: number
  sessionId: number
  input: Readonly<{ dial: number; button: number }>
  items: readonly CarouselItem[]
}>

export type CarouselTransport = Readonly<{
  commitList: (items: readonly CarouselItem[]) => Promise<boolean>
  bindInput: (dial: number, button: number) => Promise<boolean>
}>

export type CarouselCallbacks = Readonly<{
  requestArtwork: (session: CarouselSession, item: CarouselItem) => void
  activate: (session: CarouselSession, item: CarouselItem) => void
}>

/**
 * Firmware emits legacy GAME_* notifications without provider identity. This
 * coordinator supplies it from the immutable active Ctrl session.
 */
export class CarouselCoordinator {
  private active: CarouselSession | undefined

  constructor(private readonly transport: CarouselTransport, private readonly callbacks: CarouselCallbacks) {}

  snapshot(): CarouselSession | undefined {
    return this.active
  }

  async open(session: CarouselSession): Promise<boolean> {
    this.validate(session)
    // Clear first so queued work for the previous provider becomes stale before
    // its card packets can interleave with this list transaction.
    this.active = undefined
    if (!await this.transport.commitList(session.items)) return false
    if (!await this.transport.bindInput(session.input.dial, session.input.button)) return false
    this.active = session
    this.requestSelected(session.items[0].itemId)
    return true
  }

  selectLegacyItem(itemId: string): boolean {
    return this.requestSelected(itemId)
  }

  activateLegacyItem(itemId: string): boolean {
    const session = this.active
    const item = session?.items.find(candidate => candidate.itemId === itemId)
    if (!session || !item) return false
    this.callbacks.activate(session, item)
    return true
  }

  preloadFirst(): boolean {
    const session = this.active
    const item = session?.items[0]
    if (!session || !item) return false
    this.callbacks.requestArtwork(session, item)
    return true
  }

  private requestSelected(itemId: string): boolean {
    const session = this.active
    const item = session?.items.find(candidate => candidate.itemId === itemId)
    if (!session || !item) return false
    this.callbacks.requestArtwork(session, item)
    return true
  }

  private validate(session: CarouselSession): void {
    if (!/^[A-Za-z0-9-]+$/.test(session.id) || session.sessionId < 1 ||
        session.input.dial < 0 || session.input.dial > 3 ||
        session.input.button < 0 || session.input.button > 15 ||
        session.items.length < 1 || session.items.length > 64) {
      throw new Error('Invalid carousel session')
    }
    const ids = new Set<string>()
    for (const item of session.items) {
      if (!/^[A-Za-z0-9._-]{1,12}$/.test(item.itemId) || ids.has(item.itemId)) {
        throw new Error('Carousel item ids must be unique and firmware-safe')
      }
      ids.add(item.itemId)
    }
  }
}
