# Cue LED effects

`plugins.system.leds.flash(options)` requests a temporary whole-array LED
override. It is intended for unambiguous cue acknowledgement, not persistent
lighting state.

```js
await plugins.system.leds.flash({
  color: '#ff0000',
  durationMs: 500,
})
```

The current firmware supports `flash` with a six-digit RGB color and a duration
from 50 to 5,000 ms. It renders from the firmware main loop, does not allocate
memory or modify the input interrupt, and restores the normal button-driven LED
fade state automatically. A disconnected device or invalid request returns
`false` without changing persistent device preferences.

This is intentionally an extensible transient-effect API. Future effects must
be added as named cue operations with bounded parameters, rather than exposing
raw LED memory or persistent color state to arbitrary cues.
