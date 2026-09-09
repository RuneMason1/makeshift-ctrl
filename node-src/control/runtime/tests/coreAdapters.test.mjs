import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ArtworkAssetStore,
  ArtworkTransferScheduler,
  LegacyArtworkResidency,
} from '../artworkCore.mjs'
import { CarouselSessionCoordinator } from '../carouselSessionCoordinator.mjs'
import { CACHE_PACKET_TYPES, CACHE_PROTOCOL_VERSION } from '../cacheProtocol.mjs'
import { parseDeviceCapabilities, PROTOCOL } from '../protocolSchema.mjs'
import { ProtocolAckTracker } from '../protocolAckTracker.mjs'
import { createLegacyDirectArtTransport } from '../legacyDirectArtTransport.mjs'
import { SerialLifecycle } from '../serialLifecycle.mjs'
import { WireScheduler } from '../wireScheduler.mjs'

test('WireScheduler cancels queued work from an older connection epoch', async () => {
  const scheduler = new WireScheduler()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const first = scheduler.enqueue({ key: 'first', execute: async () => { await gate; return 'first' } })
  const stale = scheduler.enqueue({ key: 'stale', execute: async () => 'stale' })
  scheduler.beginEpoch()
  release()
  assert.equal(await first, 'first')
  assert.equal(await stale, false)
})

test('ArtworkAssetStore coalesces and reuses preparation', async () => {
  const store = new ArtworkAssetStore()
  let calls = 0
  const prepare = async () => { calls++; return Buffer.from([1, 2, 3]) }
  const [first, second] = await Promise.all([
    store.prepare('same', prepare),
    store.prepare('same', prepare),
  ])
  assert.equal(first, second)
  assert.equal(calls, 1)
  assert.equal(await store.prepare('same', prepare), first)
  assert.equal(calls, 1)
})

test('ArtworkAssetStore invalidates a provider prefix without discarding other artwork', async () => {
  const store = new ArtworkAssetStore()
  const plex = await store.prepare('plex/1', () => Buffer.from([1]))
  const steam = await store.prepare('steam/1', () => Buffer.from([2]))
  store.invalidatePrefix('plex/')
  const refreshedPlex = await store.prepare('plex/1', () => Buffer.from([3]))
  assert.notEqual(refreshedPlex, plex)
  assert.equal(await store.prepare('steam/1', () => Buffer.from([4])), steam)
})

test('keyed cache packet contract matches the firmware MessageType enum', () => {
  assert.equal(CACHE_PROTOCOL_VERSION, 4)
  assert.deepEqual(CACHE_PACKET_TYPES, {
    begin: 27,
    chunk: 28,
    commit: 29,
    bind: 30,
  })
})

test('typed capability packets are parsed without debug-text negotiation', () => {
  const packet = Buffer.from([PROTOCOL.capabilityPacket, 1, 8, 0xfe, 0x1f, 8, 7, 0, 0xf0, 4, 1, 0, 240, 0, 1, 94, 0])
  assert.deepEqual(parseDeviceCapabilities(packet), {
    runtimeProtocol: 1, maxComponents: 8, maxAssets: 8, cacheSlots: 7,
    cacheProtocol: 4, featureBits: 1, packetBodyLimit: 240, cacheBytes: 89600,
  })
})

test('ProtocolAckTracker resolves only the matching correlated acknowledgement', async () => {
  const tracker = new ProtocolAckTracker()
  const begin = tracker.waitFor(27)
  assert.equal(tracker.accept(Buffer.from([1, 29])), false)
  assert.equal(tracker.accept(Buffer.from([1, 27])), true)
  await begin
})

test('ProtocolAckTracker rejects a pending request on a firmware error', async () => {
  const tracker = new ProtocolAckTracker()
  const commit = tracker.waitFor(29)
  assert.equal(tracker.reject(29, 'invalid state'), true)
  await assert.rejects(commit, /invalid state/)
})

test('ProtocolAckTracker discards late acknowledgements from a disconnected session', async () => {
  const tracker = new ProtocolAckTracker()
  const oldBegin = tracker.waitFor(27)
  tracker.clear(new Error('disconnected'))
  await assert.rejects(oldBegin, /disconnected/)

  // The old device's delayed ACK must not satisfy a request from its successor.
  assert.equal(tracker.accept(Buffer.from([1, 27])), false)
  const newBegin = tracker.waitFor(27)
  assert.equal(tracker.accept(Buffer.from([1, 27])), true)
  await newBegin
})

test('ProtocolAckTracker does not let an older connection ACK satisfy a retry', async () => {
  const tracker = new ProtocolAckTracker()
  const retry = tracker.waitFor(29, { epoch: 2 })
  assert.equal(tracker.accept(Buffer.from([1, 29]), { epoch: 1 }), false)
  assert.equal(tracker.accept(Buffer.from([1, 29]), { epoch: 2 }), true)
  await retry
})

test('ArtworkTransferScheduler promotes selected work ahead of preload', async () => {
  const scheduler = new ArtworkTransferScheduler()
  const order = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const current = () => true
  const first = scheduler.enqueue({ key: 'first', priority: 0, isCurrent: current,
    execute: async () => { order.push('first'); await gate; return true } })
  const preload = scheduler.enqueue({ key: 'preload', priority: 2, isCurrent: current,
    execute: async () => { order.push('preload'); return true } })
  const selected = scheduler.enqueue({ key: 'selected', priority: 2, isCurrent: current,
    execute: async () => { order.push('selected'); return true } })
  assert.equal(scheduler.promote('selected', 0), true)
  release()
  await Promise.all([first, preload, selected])
  assert.deepEqual(order, ['first', 'selected', 'preload'])
})

test('LegacyArtworkResidency has one shared slot map', () => {
  const residency = new LegacyArtworkResidency(2)
  residency.bind(1, 'plex:4')
  assert.equal(residency.has('plex:4'), true)
  assert.equal(residency.findSlot(value => value === null), 0)
  residency.reset()
  assert.deepEqual(residency.snapshot(), [null, null])
})

test('CarouselSessionCoordinator deduplicates and cancels stale opens', async () => {
  const coordinator = new CarouselSessionCoordinator()
  const session = { id: 'steam', input: { dial: 1, button: 2 }, items: [{ itemId: 'a', title: 'A' }] }
  let sends = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const first = coordinator.open(session, async ({ isCurrent }) => {
    sends++
    await gate
    return isCurrent()
  })
  const duplicate = coordinator.open(session, async () => {
    sends++
    throw new Error('duplicate open should not send')
  })
  coordinator.clear()
  release()
  assert.deepEqual(await Promise.all([first, duplicate]), [undefined, undefined])
  assert.equal(sends, 1)
  const active = await coordinator.open(session, async () => true)
  assert.equal(coordinator.active, active)
})

test('CarouselSessionCoordinator prevents a replaced slow open from becoming active', async () => {
  const coordinator = new CarouselSessionCoordinator()
  const steam = { id: 'steam', input: { dial: 1, button: 2 }, items: [{ itemId: 'a', title: 'A' }] }
  const plex = { id: 'plex', input: { dial: 2, button: 3 }, items: [{ itemId: 'b', title: 'B' }] }
  let releaseSteam
  const gate = new Promise(resolve => { releaseSteam = resolve })
  const slowSteam = coordinator.open(steam, async ({ isCurrent }) => {
    await gate
    return isCurrent()
  })
  const activePlex = coordinator.open(plex, async ({ isCurrent }) => isCurrent())
  releaseSteam()
  assert.equal(await slowSteam, undefined)
  const plexSession = await activePlex
  assert.equal(coordinator.active, plexSession)
  assert.equal(coordinator.active.id, 'plex')
})

test('LegacyDirectArtTransport emits a complete direct-art transaction', async () => {
  const packets = []
  const transport = createLegacyDirectArtTransport({
    capacity: 2, artSize: 2, chunkPixels: 2, chunkGapMs: 0, titleLimit: 8,
    packetTypes: { begin: 7, chunk: 8, commit: 9 }, report: () => {},
  })
  const committed = await transport.send({
    port: { sendPacket: (type, data) => { packets.push([type, data && Buffer.from(data)]); return true } },
    session: { id: 'test', wireSessionId: 1 }, slot: 0, itemIndex: 0,
    title: 'title', artwork: Buffer.alloc(8), isCurrent: () => true,
  })
  assert.equal(committed, true)
  assert.deepEqual(packets.map(([type]) => type), [7, 8, 8, 9])
  assert.equal(packets[1][1].readUInt32BE(0), 0)
  assert.equal(packets[2][1].readUInt32BE(0), 2)
})

test('LegacyDirectArtTransport aborts a stale transfer before commit', async () => {
  const packets = []
  let current = true
  const transport = createLegacyDirectArtTransport({
    capacity: 1, artSize: 2, chunkPixels: 1, chunkGapMs: 0, titleLimit: 8,
    packetTypes: { begin: 7, chunk: 8, commit: 9 }, report: () => {},
  })
  const sent = await transport.send({
    port: { sendPacket: type => { packets.push(type); if (type === 8) current = false; return true } },
    session: { id: 'steam', wireSessionId: 1 }, slot: 0, itemIndex: 0,
    title: 'title', artwork: Buffer.alloc(8), isCurrent: () => current,
  })
  assert.equal(sent, false)
  assert.deepEqual(packets, [7, 8])
})

test('SerialLifecycle cleans up listeners across stop', () => {
  const calls = []
  const listeners = []
  const serial = {
    Ports: { COM3: { close: () => calls.push('close') } },
    PortAuthority: {
      on: (event, listener) => listeners.push(['on', event, listener]),
      off: (event, listener) => listeners.push(['off', event, listener]),
    },
    PortAuthorityEvents: { port: { opened: 'opened', closed: 'closed' } },
    setLogLevel: () => calls.push('log'),
    setPortAuthorityLogLevel: () => calls.push('authority-log'),
    startAutoScan: () => calls.push('scan-start'),
    stopAutoScan: () => calls.push('scan-stop'),
  }
  const lifecycle = new SerialLifecycle({ serial, report: event => calls.push(event), onOpened: () => {}, onClosed: () => {} })
  lifecycle.start()
  lifecycle.yield()
  lifecycle.resume()
  lifecycle.resetScan('test')
  lifecycle.stop()
  assert.equal(listeners.filter(([kind]) => kind === 'on').length, 2)
  assert.equal(listeners.filter(([kind]) => kind === 'off').length, 2)
  assert.equal(calls.includes('serial-yielded'), true)
  assert.equal(calls.includes('serial-resumed'), true)
})

test('SerialLifecycle delegates port cleanup to a capable authority', () => {
  const calls = []
  const serial = {
    Ports: { legacy: { close: () => calls.push('legacy-close') } },
    PortAuthority: { on: () => {}, off: () => {} },
    PortAuthorityEvents: { port: { opened: 'opened', closed: 'closed' } },
    setLogLevel: () => {}, setPortAuthorityLogLevel: () => {},
    startAutoScan: () => calls.push('scan-start'), stopAutoScan: () => calls.push('scan-stop'),
    closeAllPorts: () => calls.push('authority-close-all'),
  }
  const lifecycle = new SerialLifecycle({ serial, report: () => {}, onOpened: () => {}, onClosed: () => {} })
  lifecycle.start()
  lifecycle.yield()
  assert.deepEqual(calls, ['scan-start', 'scan-stop', 'authority-close-all'])
})

test('SerialLifecycle collapses concurrent recovery requests into one reset', async () => {
  const calls = []
  const serial = {
    Ports: {},
    PortAuthority: { on: () => {}, off: () => {} },
    PortAuthorityEvents: { port: { opened: 'opened', closed: 'closed' } },
    setLogLevel: () => {}, setPortAuthorityLogLevel: () => {},
    startAutoScan: () => calls.push('scan-start'), stopAutoScan: () => calls.push('scan-stop'),
    closeAllPorts: () => calls.push('close-all'),
  }
  const lifecycle = new SerialLifecycle({ serial, report: event => calls.push(event), onOpened: () => {}, onClosed: () => {} })
  lifecycle.start()
  assert.equal(lifecycle.scheduleRecovery('write-failure', { delayMs: 1, beforeReset: () => calls.push('detach') }), true)
  assert.equal(lifecycle.scheduleRecovery('duplicate', { delayMs: 1 }), false)
  assert.equal(lifecycle.snapshot().recoveryPending, true)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(lifecycle.snapshot().recoveryPending, false)
  assert.deepEqual(calls, [
    'scan-start', 'serial-recovery-scheduled', 'detach', 'scan-stop', 'scan-start', 'serial-scan-reset',
  ])
})
