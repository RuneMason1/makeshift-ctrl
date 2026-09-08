# Ctrl Core Parity Ledger

The current Systray `MakeShiftAgent` remains the live host for Core. The Ctrl
frontend is not eligible for cutover until every item below is implemented, validated
against the same configuration, and explicitly tested on the device.

## Migrating Now

- `ControlService`: lifecycle, ownership, client attachment.
- `AssetStore`: immutable host-RAM prepared artwork source cache.
- `TransferScheduler`: cross-provider priority work lane.
- `CarouselCoordinator`: immutable session, input binding, legacy firmware
  selection/activation routing.
- `CarouselSessionCoordinator`: validation, open deduplication, generation
  cancellation, wire-session identity, and one active session.
- `SerialLifecycle`: scan ownership, listener lifetime, yield/resume, and
  disconnected scan recovery.
- `LegacyDirectArtTransport`: firmware-matched list, binding and RGB565 packet
  adapter. It retains the live agent's conservative chunk timing for parity.
- `LegacyArtworkResidency`: sole owner of the paired firmware's seven physical
  direct-art slots.
- `control/runtime/agentRuntime.mjs`: literal current-agent feature baseline,
  now exposed through inert import plus `startCore()` / `stopCore()`.
- Core-only artwork staging: an immutable RAM `ArtworkAssetStore` and one
  priority transfer scheduler. Selected artwork is priority 0, immediate
  neighbors priority 1, and background preload priority 2. The paired legacy
  firmware still exposes only seven physical RGB565 slots, so Core maintains
  one active-session residency map; Steam and Plex cannot independently claim
  the same slot.
  Prepared Steam and Plex RGB565 artwork is retained in that same shared store
  before transmission; provider code no longer owns the transferable image
  payload for a carousel session.
  The Core status snapshot reports asset-store capacity, queued transfer
  priorities, and legacy slot residency for the later hardware trial.

## Still Agent-Only

- serial discovery, ownership, reconnect and USB idle recovery;
- serial packet framing outside the extracted legacy direct-art transaction;
- cue discovery, JavaScript cue execution, and plugin registration;
- runtime assets, zones, visual preferences, glyph assets, LEDs and status;
- GoXLR, Home Assistant, media target selection, Plex and Steam providers;
- logging, watchdogs, firmware-update coordination, and Ctrl-editor yielding.

The items above are still implemented inside the migrated runtime baseline;
they are agent-host-only only in the sense that they have not yet been split
into smaller Core adapters. No current feature was intentionally omitted from
Core during the source migration.

The Core artwork lane is intentionally ahead of the live agent. It is offline
staging only: it has passed parsing, inert import, and Ctrl type generation,
but has not been connected to a device. It must not be packaged, started, or
called feature-parity validated until it completes the cutover gate.

The approval-required hardware gate is documented in
`docs/core-v2-device-regression.md`. It requires no firmware flash and treats
the current agent as the immediate rollback authority.

Core now acquires the named-pipe control boundary before serial discovery. A
second V2 launch therefore fails before it can compete for COM3 with the live
agent.

## Ctrl Preservation Rule

Reattaching Ctrl to Core must preserve the existing editor's capabilities:
code and Blockly cue authoring, cue files/folders, event assignment, layout
editing, device/serial inspection, terminal output, visual preferences,
plugins, and firmware tools. A new Core status surface is additive; it must
not replace the cue editor or make direct user cue authoring a second-class
path.

## Cutover Gate

1. Ctrl runs the same cue/config directory in headless mode.
2. Ctrl produces the same device packet trace for a defined regression suite.
3. Ctrl passes reconnect, carousel switch, rapid dial, visual, media and LED
   tests while the current agent remains the rollback path.
4. Only then does a minimal agent host Core and own the one serial port.

## Minimal Agent Contract

The post-cutover agent must not duplicate cue, carousel, artwork, or protocol
logic. It only supplies Ctrl core with:

- a serial packet writer and hardware input/event stream;
- Windows-only integrations such as GoXLR, Home Assistant configuration,
  media-session access, recovery actions and process supervision;
- configuration/log directory paths and a small stdin control surface.

Ctrl core owns all state transitions and returns status/events to the host.
This keeps the desktop Ctrl UI and headless agent behavior identical.

## Current Core API

`agentRuntime.mjs` exports `startCore()`, `stopCore()`, `getCoreStatus()`,
`reloadCore()`, `yieldCore()`, and `resumeCore()`. Import is inert when
`MAKESHIFT_CORE_AUTOSTART=0`; only `startCore()` begins serial scanning,
timers, pipe serving, cue watching, or media polling.
