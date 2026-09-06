# Screen zones

Screen zones let cues request reusable display behavior without knowing screen
coordinates or depending on a specific feature such as media, lighting, or
audio. Use the `plugins.screenZones` API attached to every loaded cue.

## Canonical zones

| Zone | Accepted content | Purpose |
| --- | --- | --- |
| `fullscreen` | collection | Exclusive collection or full-screen experience |
| `bottom-left` | status, clear | Persistent label and percentage panel |
| `bottom-center-left` | status, clear | Optional inner-left status slot |
| `bottom-center-right` | status, clear | Optional inner-right status slot |
| `bottom-right` | status, clear | Persistent label and percentage panel |
| `upper-text` | text, clear | Scrolling text or short banner |
| `center` | asset, clear | Temporary cached image or glyph |
| `left-rail` | asset, clear | Persistent image in the left middle band |
| `right-rail` | asset, clear | Persistent image in the right middle band |
| `status-bar` | system state, preference colors | Device connection health, owned by firmware |

Legacy cue names remain accepted: `special`, `full-screen`, `lower-left`,
`lower-right`, `bottom-inner-left`, `bottom-inner-right`, `now-playing`,
`upper`, `center-glyph`, `overlay`, `connection`, and `top-bar`. New cues should
use canonical names.

The four bottom zones are equal logical slots. A corner panel may use its
neighboring center slot while that slot is unclaimed. Once a cue claims the
center slot, the compositor compacts both panels instead of allowing draw-order
overlap. The rails occupy only the area between `upper-text` and the bottom row.

## Cue API

```js
function setup() {
  plugins.screenZones.text('upper-text', 'Artist - Track')
  plugins.screenZones.status('bottom-left', {
    label: 'Brightness',
    percent: 75,
    adjusting: false,
    inactive: false,
  })
}

function run() {
  plugins.screenZones.asset('center', 'example.confirm')
}
```

Available operations are:

- `text(zone, value, options)` sends UTF-8 text. Set `options.active` to
  `false` to hide it.
- `asset(zone, name)` displays a named cue or shared runtime asset already in
  the general device cache.
- `status(zone, value)` sends `label`, `percent`, `adjusting`, and `inactive`.
- `clear(zone)` returns a content zone to its empty state.
- `names` and `capabilities` expose the canonical registry for reusable tools.

The API rejects unsupported combinations instead of drawing into another
region. In particular, cues cannot write connection state into `status-bar`.
They may select its connected/disconnected colors through Ctrl preferences.

`fullscreen` is intentionally delegated to the collection module because it owns
the full-screen interaction lifecycle rather than a single text/image payload.

## Compatibility

The established `upper-text`, `center`, `bottom-left`, and `bottom-right`
updates retain their legacy packet paths. Rails, inner bottom slots, and
explicit clearing use generic `SCREEN_ZONE` support and therefore require the
screen-zone firmware candidate. Existing cues remain compatible with the
currently deployed firmware.

Bundle cue-specific images in `runtimeAssets`; use `requiredAssets` only for
intentionally shared presets. See [Cue runtime assets](cue-runtime-assets.md).
