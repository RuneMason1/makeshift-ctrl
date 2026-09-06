# System actions

`plugins.system` is the portable cue boundary for host-owned operating-system
operations. Cues request named actions; Ctrl owns the platform implementation
and rejects unknown names. This keeps machine-level access out of private cues.

```js
plugins.system.media.send('playPause')
plugins.system.run('display.wake', 'graphics.reset')
```

Current actions:

- `display.wake`: request that Windows wakes the display.
- `graphics.reset`: send Windows' built-in `Win+Ctrl+Shift+B` graphics reset.
- `system.media.send('playPause' | 'next' | 'previous')`: send desktop media
  transport keys.

`desktopMedia` remains a legacy compatibility alias. New cues should use
`plugins.system.media`.
