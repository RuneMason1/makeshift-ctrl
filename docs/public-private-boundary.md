# MakeShift Public/Private Boundary

## Goal

The repos should become usable by other people without shipping private
behavior.

That means:

- public repos contain reusable runtime code
- private cues contain personal automations, integrations, and mappings

## Repo Roles

### `makeshift-firmware`

Public, reusable device runtime.

It should contain:

- hardware handling
- generic rendering modules
- generic caches
- generic visual preferences
- generic packet handling

It should not contain:

- user-specific automation logic
- app-specific launch logic where generic activation would do
- private accounts or private assets

### `makeshift-ctrl`

Public, reusable host/runtime coordinator.

It should contain:

- transport and protocol code
- asset loading/preparation
- preferences
- profile and module orchestration
- generic event-to-action plumbing

It should not contain:

- one user's personal workflow logic hard-coded into the runtime
- private assets that are not suitable for redistribution
- secrets or account-specific identifiers

### Cues

Private customization layer.

Cues should contain:

- personal button mappings
- app-specific behaviors
- user-specific integrations
- local workflows
- private assets and private preferences if they are not intended for
  redistribution

## Practical Rule

When deciding where code belongs:

- if it is reusable, it belongs in firmware or ctrl
- if it is personal, app-specific, or private, it belongs in cues

## Examples

### Public/runtime code

- collection view rendering
- shared image cache
- generic LED pattern support
- generic mute/activate/select event support
- generic preferences for visuals

### Private/cue code

- GoXLR control mappings
- private app launch behavior
- personal media workflow
- per-user button meanings
- cue sets for a specific desk setup

## Module Consumption Model

The intended model is:

1. firmware exposes reusable modules
2. ctrl coordinates them
3. cues decide how they are used

For example:

- firmware module: collection view
- ctrl service: asset preparation + item list transport
- cue behavior: "this collection is my app launcher"

The same public module could then be reused as:

- game launcher
- app switcher
- media browser
- favorite actions carousel

without changing the firmware.

## Documentation Standard

Whenever a new reusable feature is added to firmware or ctrl, it should be
documented as:

- purpose
- what layer owns it
- public inputs
- public outputs
- what belongs in cues instead

This keeps the public runtime understandable for other users and keeps private
logic out of the repos.

## Runtime Asset Convention

Reusable cue-driven glyphs should be declared as public runtime assets rather
than hard-coded as private behavior.

Current examples:

- `media.previous`
- `media.play-pause`
- `media.next`
- `media.mute`
- `media.unmute`

Built-in reusable presets:

- `preset.transport-glyphs`
- `preset.common-glyphs`

The intended flow is:

1. a cue declares `requiredAssets`
2. ctrl resolves those assets through the public runtime asset catalog
3. ctrl preloads them into firmware RAM
4. firmware renders them through generic overlay or module APIs

Example:

```js
export const requiredAssets = ['preset.common-glyphs']
export const glyph = 'media.mute'
```

## Public Runtime Naming

New public runtime code should prefer generic names over feature-specific ones.

Examples:

- `collection-view` instead of only `carousel`
- `overlay-glyphs` instead of only transport/action wording
- runtime packet aliases like `COLLECTION_LIST_*` and `OVERLAY_GLYPH`

Legacy names remain valid during migration so existing firmware, ctrl, and cue
code keeps working.

## Provider Pattern

App-specific data sources should be exposed as reusable provider modules in
ctrl instead of leaking app semantics through the whole runtime.

Current implementation:

- `collectionRuntime.ts` owns generic collection selection, device transport,
  artwork conversion/cache, timeout, and activation dispatch
- `collectionProviderRegistry.ts` owns lazy provider registration and routing
- `collectionProviderCatalog.ts` declares the providers shipped by ctrl
- `gameLauncher.ts` discovers Steam games and supplies Steam-specific activation
- `GameLauncher` remains as a compatibility API for existing cues

That means new public runtime code should prefer concepts like:

- collections
- items
- selection
- activation
- artwork providers

instead of treating games or Steam as the primary runtime abstraction.

### Creating a collection provider

A provider supplies `CollectionItem` values and an activation callback to
`CollectionRuntime`:

```ts
const runtime = new CollectionRuntime({
  getPort,
  activateItem: item => activate(item.itemId),
  messagePrefix: 'MY_COLLECTION_ACTIVATE:',
  dialEventPrefix: 'sensor-1',
})

runtime.setItems(items)
```

Each item has a stable `itemId`, display `title`, numeric `rank`, and optional
local `artworkPath`. Artwork is converted and cached on demand when an item is
shown; loading a provider does not permanently load its entire collection into
RAM.

The default packet names still use legacy `GAME_*` identifiers for firmware
compatibility. Provider and cue code should use collection terminology.

### Declaring a provider in a cue

Cues request providers by stable public ID. Merely cataloguing a provider does
not instantiate or initialize it.

```js
const requiredPlugins = ['collectionProviders']
const requiredProviders = ['steam']

function setup() {
  plugins.collectionProviders.get('steam').setArtworkEnabled(true)
}
```

Ctrl validates `requiredProviders` while loading the cue. A requested provider
is created lazily on the first `get(...)`; unused providers do not scan their
data source, allocate collection state, or receive device messages.

To ship a reusable provider, implement the `CollectionProvider` interface and
add its factory and stable ID to `collectionProviderCatalog.ts`. Ctrl startup,
serial message routing, and device synchronization remain provider-agnostic.

The legacy `plugins.gameLauncher` facade remains available so existing cues can
migrate independently.
