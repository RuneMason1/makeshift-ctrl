import { MakeShiftPort, PacketType } from '@eos-makeshift/serial'
import { NamedRuntimeAsset, resolveRuntimeAssets, RuntimeAsset } from './assetCatalog'

export const RUNTIME_PROTOCOL_VERSION = 1

export enum RuntimeComponentType {
  Carousel = 1,
  MeterBank = 2,
  TransportBar = 3,
  LogoPanel = 4,
  ButtonGrid = 5,
  ListPicker = 6,
  StatusCard = 7,
}

// Generic aliases for public reusable runtime code. Legacy names remain valid
// for compatibility with current firmware and cue code.
export const RuntimeComponentAlias = {
  CollectionView: RuntimeComponentType.Carousel,
  OverlayGlyphPanel: RuntimeComponentType.TransportBar,
  InfoPanel: RuntimeComponentType.StatusCard,
} as const

export enum RuntimeZone {
  Special = 0,
  LowerLeft = 1,
  LowerRight = 2,
  Upper = 3,
  Center = 4,
}

export const RuntimeZoneAlias = {
  FullScreen: RuntimeZone.Special,
  Left: RuntimeZone.LowerLeft,
  TopBar: RuntimeZone.Upper,
  Overlay: RuntimeZone.Center,
  CenterStage: RuntimeZone.Special,
  SidebarLeft: RuntimeZone.LowerLeft,
  CornerLowerRight: RuntimeZone.LowerRight,
  BannerTop: RuntimeZone.Upper,
  FloatingOverlay: RuntimeZone.Center,
} as const

export enum RuntimeComponentFlag {
  Enabled = 1 << 0,
  Preload = 1 << 1,
}

export type RuntimeComponent = {
  id: number
  type: RuntimeComponentType
  zone: RuntimeZone
  flags: number
}

export class DeviceRuntimeManifest {
  private components = new Map<number, RuntimeComponent>()
  private assets: RuntimeAsset[] = []

  register(component: RuntimeComponent): void {
    this.components.set(component.id, component)
  }

  unregister(id: number): void {
    this.components.delete(id)
  }

  setRequiredAssets(names: Iterable<string>, cueAssets: Iterable<NamedRuntimeAsset> = []): void {
    this.assets = resolveRuntimeAssets(names, cueAssets)
  }

  setRequiredComponents(names: Iterable<string>): void {
    this.components.clear()
    for (const name of names) {
      if (name === 'carousel' || name === 'collection-view') {
        this.register({
          id: 1,
          type: RuntimeComponentType.Carousel,
          zone: RuntimeZone.Special,
          flags: RuntimeComponentFlag.Enabled | RuntimeComponentFlag.Preload,
        })
      } else if (name === 'overlay-glyphs') {
        this.register({
          id: 2,
          type: RuntimeComponentAlias.OverlayGlyphPanel,
          zone: RuntimeZoneAlias.FloatingOverlay,
          flags: RuntimeComponentFlag.Enabled | RuntimeComponentFlag.Preload,
        })
      }
    }
  }

  sync(port: MakeShiftPort): boolean {
    const components = [...this.components.values()]
    if (components.length > 8) return false
    if (!port.sendPacket(PacketType.RUNTIME_MANIFEST_BEGIN,
      Buffer.from([RUNTIME_PROTOCOL_VERSION, components.length]))) return false

    for (const component of components) {
      if (!port.sendPacket(PacketType.RUNTIME_COMPONENT, Buffer.from([
        component.id, component.type, component.zone, component.flags,
      ]))) return false
    }
    if (!port.sendPacket(PacketType.RUNTIME_MANIFEST_COMMIT)) return false
    return this.syncAssets(port)
  }

  private syncAssets(port: MakeShiftPort): boolean {
    for (const asset of this.assets) {
      const begin = Buffer.allocUnsafe(6)
      begin[0] = asset.id
      begin[1] = asset.format
      begin[2] = asset.width
      begin[3] = asset.height
      begin.writeUInt16BE(asset.data.length, 4)
      if (!port.sendPacket(PacketType.ASSET_BEGIN, begin)) return false

      for (let offset = 0; offset < asset.data.length; offset += 220) {
        const data = asset.data.subarray(offset, offset + 220)
        const chunk = Buffer.allocUnsafe(2 + data.length)
        chunk.writeUInt16BE(offset, 0)
        data.copy(chunk, 2)
        if (!port.sendPacket(PacketType.ASSET_CHUNK, chunk)) return false
      }
      if (!port.sendPacket(PacketType.ASSET_COMMIT)) return false
    }
    return true
  }
}
