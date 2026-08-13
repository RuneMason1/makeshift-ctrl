import { MakeShiftPort } from '@eos-makeshift/serial'

export interface CollectionProvider {
  readonly id: string
  initialize(): Promise<void>
  setArtworkEnabled(enabled: boolean): void
  syncToDevice(port?: MakeShiftPort): void
  handleDeviceMessage(message: string): Promise<void>
  handleEvent(eventName: string, showArtwork?: boolean): Promise<boolean>
}

export type CollectionProviderFactory = () => CollectionProvider

export class CollectionProviderRegistry {
  private readonly factories = new Map<string, CollectionProviderFactory>()
  private readonly providers = new Map<string, CollectionProvider>()

  register(id: string, factory: CollectionProviderFactory): void {
    if (this.factories.has(id)) {
      throw new Error(`Collection provider already registered: ${id}`)
    }
    this.factories.set(id, factory)
  }

  has(id: string): boolean {
    return this.factories.has(id)
  }

  get(id: string): CollectionProvider {
    const existing = this.providers.get(id)
    if (existing) return existing
    const factory = this.factories.get(id)
    if (!factory) throw new Error(`Unknown collection provider: ${id}`)
    const provider = factory()
    if (provider.id !== id) {
      throw new Error(`Collection provider factory '${id}' returned '${provider.id}'`)
    }
    this.providers.set(id, provider)
    return provider
  }

  async initialize(): Promise<void> {
    // Only providers requested through get() are initialized.
    await Promise.all([...this.providers.values()].map(provider => provider.initialize()))
  }

  async handleDeviceMessage(message: string): Promise<void> {
    await Promise.all([...this.providers.values()].map(provider =>
      provider.handleDeviceMessage(message)))
  }

  syncToDevice(port: MakeShiftPort): void {
    for (const provider of this.providers.values()) provider.syncToDevice(port)
  }
}
