# Home Assistant media routing

The background Ctrl agent exposes `plugins.homeAssistantMedia.route(action)` to
cues. Supported actions are `playPause`, `next`, and `previous`.

It also provides `plugins.system.media.seekActiveRelative(seconds)`. This is a
generic cue API: it resolves the same source currently shown by Now Playing.
The Home Assistant source implements it by reading its current position and
issuing a clamped `media_player.media_seek` request. A source without a safe
relative-seek capability is left unchanged and reported as unsupported; this
does not fall back to a focused-application keyboard shortcut.

Configure target priority in the private Home Assistant settings:

```json
{
  "mediaLastActiveEntityId": "input_text.last_active_media_player",
  "mediaPlayers": [
    "media_player.primary_computer",
    "media_player.television",
    "media_player.chromecast"
  ]
}
```

The router selects the first configured player whose Home Assistant state is
`playing` and stores it in the configured `input_text` helper. If no player is
currently playing, it uses the remembered player. It returns `false` when no
valid Home Assistant target exists, allowing a cue to use a local fallback.

```js
async function run() {
  if (await plugins.homeAssistantMedia.route('playPause')) return
  return plugins.Nut.keyboard.type(plugins.Nut.Key.AudioPlay)
}
```

Entity IDs and access tokens belong in private user configuration, not public
cues or reusable module code.
