# Cue runtime assets

Cues can bundle every display asset required by their action. Ctrl discovers
these assets from active cues and uploads them to the MakeShift general cache
when the device connects.

```js
const runtimeAssets = [{
  name: 'example.status',
  id: 8,
  format: 1,
  width: 32,
  height: 32,
  data: Buffer.from(/* 1-bit, row-major bitmap bytes */),
}]

module.exports = { runtimeAssets, setup, run }
```

`runtimeAssets` is authoritative and self-contained. Each entry includes its
name, firmware cache ID, format, dimensions, and binary payload. All assets
exported by an active cue are preloaded; dynamic actions can select among them
at run time.

`format: 1` is a one-bit row-major bitmap. `format: 2` is a bounded vector
command stream. It must terminate with byte `0`; supported commands are filled
rectangle (`1, x, y, width, height`), filled triangle (`2, x1, y1, x2, y2,
x3, y3`), thick line (`3, x1, y1, x2, y2, width`), and arc (`4, cx, cy,
radius, startDegrees/2, endDegrees/2, width`). Coordinates must stay inside the
declared dimensions. Vector assets allow at most 24 commands and are rejected
when their bounded draw cost exceeds the device limit.

The optional `requiredAssets` string list requests intentionally shared assets
from Ctrl's catalog. A cue-bundled asset with the same cache ID overrides the
catalog version. Use shared presets for convenience, not as an undeclared
requirement of a portable cue.

For a fixed action glyph, exporting `glyph: 'media.play-pause'` both selects the
overlay shown when the cue runs and requests that named asset. Dynamic glyphs,
such as mute/unmute state, should bundle both entries in `runtimeAssets` and let
their plugin select the appropriate name.
