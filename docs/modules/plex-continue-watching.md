# Plex Continue Watching on MakeShift

> Implementation note (2026-09-02): the supported shape is the generic
> cue-owned carousel **session** documented in `carousels.md`. References below
> to a provider registry/catalog are retained as design history and must not be
> used for new work. The private Plex plugin creates a session; the cue supplies
> the `sensor-2` binding and opens it through the built-in `carousel` plugin.

## Goal

Reuse the Home Assistant Plex Continue Watching subsystem as a MakeShift
collection without putting Plex credentials, Home Assistant credentials, or
Plex-specific behavior in firmware.

The MakeShift device should browse a small ordered window of titles, show card
art, and activate the selected title. Home Assistant remains responsible for
the Plex library query, target selection, waking the player, native Plex client
discovery, resume offsets, and session handoff.

## Ownership boundary

### Firmware owns

- generic collection/card rendering
- dial selection and button activation
- 80x80 RGB565 collection-art reception
- screen timeout and return-home behavior
- generic serial packet parsing

Firmware must not contain Plex URLs, entity IDs, access tokens, library names,
or playback rules.

### Ctrl owns

- an authenticated Home Assistant WebSocket client or service adapter
- conversion of the HA feed into `CollectionItem` values
- decoding base64 JPEG artwork into local cache files
- the rolling item window and refresh policy
- forwarding activation to Home Assistant
- retries, connection status, and user-visible errors

### Private configuration or plugin owns

- Home Assistant URL and long-lived access token
- preferred playback target
- personal entity IDs if they are ever needed outside the HA backend
- cue bindings and which MakeShift control opens the collection

No secret is required by firmware. No Plex token is required by Ctrl if Ctrl
uses the Home Assistant API described here.

## Existing Home Assistant contract

Connect to Home Assistant's authenticated WebSocket API and call:

```json
{
  "id": 1,
  "type": "plex_carousel/continue_watching",
  "limit": 8
}
```

Each returned item provides:

```ts
type PlexContinueWatchingItem = {
  rating_key: string
  title: string
  grandparent_title: string | null
  parent_title: string | null
  image: string | null
  poster_image: string | null
  duration: number
  view_offset: number
}
```

Images are JPEG data URLs. Times are milliseconds. For a MakeShift card, use
`grandparent_title || title` as the primary title. The episode title can be
retained for future secondary text, but the current collection runtime accepts
one title string.

Activate an item with:

```json
{
  "id": 2,
  "type": "plex_carousel/play",
  "rating_key": "12345",
  "offset": 349000
}
```

Do not reimplement stop/wait/play behavior in the cue. A successful reply must
have `method: "native_plex"`. Surface `plex_request_failed` and
`plex_play_failed` as failures.

If the MakeShift UI needs to change playback targets, call Home Assistant's
`input_select.select_option` service for
`input_select.plex_playback_target`, using one of the currently configured
friendly values: `Chromecast`, `LR Onn`, or `iPad`. Target choice should remain
a private profile preference rather than a firmware concept.

The authoritative HA implementation documentation is:
`Y:\custom_components\plex_carousel\README.md`.

## Mapping to the collection runtime

Convert the response into the existing public type:

```ts
type CollectionItem = {
  itemId: string
  title: string
  rank: number
  artworkPath: string
}
```

Recommended mapping:

| Collection field | Plex source |
| --- | --- |
| `itemId` | `rating_key` |
| `title` | `grandparent_title || title` |
| `rank` | descending feed position, for example `itemCount - index` |
| `artworkPath` | local decoded file for `image` |

Keep an internal map from `rating_key` to `view_offset`, episode title, and
other playback metadata. The activation callback uses that map to call the HA
play command.

`CollectionRuntime` sorts by descending `rank`, then title. Preserve feed order
by assigning unique descending ranks. Reusing the same rank for every item will
alphabetize the feed.

The current runtime behavior is:

- card art is center-cropped and converted to 80x80 RGB565
- card titles are limited to 48 UTF-8 bytes
- artwork begins after a 90ms selection-settle delay
- changing selection invalidates an in-progress old transfer
- the collection returns home after 12 seconds without interaction
- artwork is cached under Electron `userData/collection-art-cache`
- the local list mode defaults to at most 64 items
- the default input is `sensor-0` unless `dialEventPrefix` is changed

The eight 32x32 monochrome runtime-asset slots do not hold collection posters.
They are a separate cache for persistent glyphs such as transport controls.

## Required Ctrl design

The preferred reusable implementation is a generic Home Assistant collection
provider, configured with feed and activation WebSocket command names. A
Plex-named cue can supply the personal binding without making the provider or
firmware Plex-specific.

Conceptual construction:

```ts
const runtime = new CollectionRuntime({
  getPort,
  messagePrefix: 'PLEX_CONTINUE_ACTIVATE:',
  dialEventPrefix: 'sensor-0',
  localItemLimit: 8,
  activateItem: async item => {
    const source = itemByRatingKey.get(item.itemId)
    await homeAssistant.callWS({
      type: 'plex_carousel/play',
      rating_key: source.rating_key,
      offset: source.view_offset,
    })
  },
})
```

The exact prefix can remain generic, such as `COLLECTION_ACTIVATE:`, after the
legacy firmware string path is generalized. Until then, every provider must
use a unique prefix and both host and firmware routing must agree on it.

### Current extension limitation

`CollectionProviderRegistry.register()` exists, but the catalog currently
registers only the built-in `steam` provider. User plugins can request providers
through `plugins.collectionProviders`, but there is not yet a documented
plugin API for registering a new provider factory.

Before implementing this privately, choose one of these deliberate paths:

1. Add a generic `home-assistant` provider to
   `node-src/main/collectionProviderCatalog.ts`, with all URLs, tokens, command
   names, and target choices supplied through private settings.
2. Extend the user-plugin context with a narrow provider-registration API, then
   implement the HA provider as a private plugin.

Option 2 best preserves the public/private boundary. Do not hard-code this
household's Home Assistant details into `collectionProviderCatalog.ts`.

## Refresh, caching, and responsiveness

Use a rolling window of 8 items initially. This is not imposed by the 32x32
asset cache; it limits Home Assistant image payload, local decoding, serial
traffic, and UI churn. Increase it only after measuring interaction latency.

Recommended policy:

- fetch after HA authentication and when the cue first opens
- refresh in the background every five minutes while Ctrl is running
- refresh immediately when Ctrl regains HA connectivity
- refresh after a successful activation, but delay about 10 seconds so Plex
  has time to update Continue Watching
- retain the last good list during transient failures
- atomically replace the runtime list only after a complete successful fetch
- cache image files by rating key plus a hash of the data URL
- delete orphaned image files periodically rather than during dial interaction
- never decode or write artwork in the input-event hot path

`CollectionRuntime` already debounces artwork transmission by 90ms and cancels
stale transfers. The provider should not add a large fixed delay. Activation
should call HA immediately and return an explicit pending/success/failure state
to logs or a generic status overlay.

The game-launcher carousel-freezing investigation is relevant: avoid replacing
large collections or starting many artwork conversions while the dial is
moving. Bound work, cache ahead of interaction, cancel stale requests, and keep
serial writes on the existing transfer path.

## Authentication and secret storage

Required private values:

```json
{
  "homeAssistantUrl": "ws://<home-assistant>/api/websocket",
  "homeAssistantToken": "<long-lived-access-token>",
  "continueWatchingCommand": "plex_carousel/continue_watching",
  "playCommand": "plex_carousel/play",
  "itemLimit": 8,
  "playbackTarget": "Chromecast"
}
```

Store them using the same private integration settings mechanism used by the
existing Home Assistant plugins. Redact tokens from logs. Never store them in:

- cue source committed to a public repository
- firmware source or flash assets
- serial packets
- artwork cache filenames
- Vikunja comments or screenshots

The HA token needs only the permissions required to authenticate and invoke the
custom WebSocket commands and target-selection service. The Plex token remains
only on Home Assistant in `plex_carousel.yaml`.

## Connection and error behavior

The provider needs explicit states: `disconnected`, `loading`, `ready`, and
`error`. It should use bounded reconnect backoff and one in-flight feed request.

- On HA disconnect, retain cached items but block activation with a clear error.
- On feed timeout, keep the old list and schedule a later retry.
- On activation timeout, do not automatically issue a second play request;
  playback may have started even if the reply was lost.
- On `plex_play_failed`, display/log the message and leave the selected item in
  place so the user can retry intentionally.
- On reconnect, authenticate before sending any custom command.

## Cue metadata and binding

A cue using the collection needs the generic full-screen component and the HA
provider:

```js
const requiredPlugins = ['collectionProviders']
const requiredProviders = ['home-assistant']
const requiredComponents = ['collection-view']
const plugins = {}

function setup() {
  plugins.collectionProviders.get('home-assistant').setArtworkEnabled(true)
}

async function run(eventData) {
  return plugins.collectionProviders
    .get('home-assistant')
    .handleEvent(eventData.event, true)
}

module.exports = {
  requiredPlugins,
  requiredProviders,
  requiredComponents,
  plugins,
  setup,
  run,
}
```

This is a target shape, not a claim that `home-assistant` is registered today.
The cue should use the layout-selected dial/button. Firmware supports
`COLLECTION_INPUT_BINDING` packet 25; dial/button zero remains the compatibility
default.

The collection occupies `RuntimeZone.Special` as an exclusive full-screen
view. Do not assign another full-screen component in the same live layout.

## Implementation checklist

1. Add a private-provider registration surface or a generic configurable HA
   provider.
2. Add a reusable authenticated HA WebSocket client with request IDs,
   timeouts, reconnect backoff, and token redaction.
3. Add private settings with the fields listed above.
4. Decode feed artwork to a provider cache outside the serial hot path.
5. Map the first eight feed items to unique ranks and call `setItems()` only
   after a successful complete refresh.
6. Keep `view_offset` in provider metadata and forward it unchanged in
   milliseconds on activation.
7. Declare `collection-view` in the cue and bind it to the intended control.
8. Add unit tests for feed mapping, rank order, data-URL decoding, token
   redaction, reconnect behavior, and activation payloads.
9. Add an integration test with a fake HA WebSocket server.
10. Test on hardware while rotating the dial rapidly, activating from idle,
    switching during active playback, and disconnecting/reconnecting HA.

## Acceptance criteria

- Continue Watching appears in Plex recency order.
- Dial movement remains responsive while artwork is loading.
- Selection changes cannot commit stale artwork.
- Activation sends the exact rating key and millisecond resume offset once.
- Successful playback reports `native_plex`.
- HA/Plex secrets never enter firmware, serial traffic, public cues, or logs.
- An HA outage leaves a usable cached list and an explicit activation error.
- Active playback can switch to another item without audio-only playback,
  stale visuals, or an immediate pause.
- The same generic provider/runtime can drive a non-Plex HA collection by
  changing private command configuration rather than firmware.

## Source references

- `node-src/main/collectionRuntime.ts`
- `node-src/main/collectionProviderRegistry.ts`
- `node-src/main/collectionProviderCatalog.ts`
- `node-src/main/deviceRuntime.ts`
- `docs/public-private-boundary.md`
- `makeshift-firmware/docs/firmware-modules.md`
- `makeshift-serial/PROTOCOL.md`
- Home Assistant Plex integration: <https://www.home-assistant.io/integrations/plex/>
