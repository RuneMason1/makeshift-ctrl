# MakeShift Core Architecture

## Core

Core is the single headless MakeShift control engine. It owns configuration,
cues, providers, device protocol, artwork, runtime assets, state, and the one
serial connection.

## Ctrl Frontend

Ctrl is the desktop editor and status frontend. It attaches to an already
running Core; closing its window hides or disconnects the frontend, not Core.
It must never start a second serial owner.

Ctrl retains its original product purpose. Its cue editor, code editor,
Blockly workspaces, event/layout assignment tools, device inspector, terminal,
preferences, plugin tools, and firmware workflow remain supported user-facing
features. Core supplies their live state and executes saved work; it does not
replace Ctrl with a reduced dashboard.

## Private Agent

The private Systray agent is a minimal Windows host for Core. It supplies
platform integration and supervision when no Ctrl window is open. It does not
contain a separate cue engine, carousel implementation, or firmware protocol.

`MakeShiftCoreAgent/agent-v2.mjs` is the staged V2 host. It loads the runtime
from Ctrl's `node-src/control/runtime` directory and only supplies host
resources. It is not packaged or enabled until parity testing completes.

## Migration

The copied agent-compatible runtime is being converted into Core in place.
Until parity tests pass, the current agent remains the live Core host and Ctrl
continues as reference/editor software.

## Artwork Compatibility Boundary

Artwork preparation and scheduling are provider-neutral Core services. The
current firmware is not: it accepts direct RGB565 uploads into seven physical
slots. `LegacyArtworkResidency` is the isolated compatibility adapter for that
limit. It is the only Core layer permitted to track firmware-slot ownership;
Steam and Plex use stable item identities and cannot claim independent slot
maps. A future byte-addressed firmware cache replaces this adapter without
changing carousel providers, cue definitions, or Ctrl's artwork API.

`LegacyDirectArtTransport` is the other compatibility adapter. It alone emits
the legacy direct-art `BEGIN`, RGB565 chunk, and `COMMIT` transaction. It
preserves established chunk pacing and accepts Core's active-session predicate,
so stale carousel work cannot commit after a different carousel becomes active.

`CarouselSessionCoordinator` is provider-neutral Core state. It validates cue
definitions, assigns a monotonically increasing wire session id, deduplicates
an in-flight open, invalidates stale opens, and exposes exactly one active
session. The runtime currently supplies the legacy list-packet callback;
providers only supply items, artwork callbacks, and activation callbacks.

`SerialLifecycle` owns serial scan start/stop, PortAuthority listener lifetime,
yield/resume for firmware updates, and disconnected scan recovery. The runtime
keeps the device-specific event and message handlers as callbacks. This avoids
duplicate listeners when Core is restarted and makes serial ownership an
explicit Core boundary.
