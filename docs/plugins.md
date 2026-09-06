# Cue plugins

Plugins are reusable cue libraries. A cue asks for a plugin by ID in
`requiredPlugins`; Ctrl validates the ID and injects only that plugin's public
API into `plugins` before `setup()` runs.

```js
const requiredPlugins = ['example.format-text', 'system']
const plugins = {}

function run() {
  const title = plugins['example.format-text'].titleCase('now playing')
  return plugins.system.media.send('playPause')
}

module.exports = { requiredPlugins, plugins, run }
```

## Built-in plugins

- `system`: portable host actions, including desktop media and named operating
  system actions.
- `screenZones`: reusable screen-zone rendering.
- `desktopMedia`: legacy compatibility alias; new cues should use
  `system.media`.

The current GoXLR, Home Assistant, and game-launcher integrations are installed
as user plugins, not built-ins. This keeps personal services out of the public
default while preserving their current cue IDs: `goXlr`,
`homeAssistantLights`, `homeAssistantMedia`, and `gameLauncher`.

## User plugins

Install a plugin folder beneath `%APPDATA%\\makeshift-ctrl\\plugins`:

```text
plugins/
  example-format-text/
    manifest.json
    format-text.plugin.cjs
```

`manifest.json` must declare an ID, version, and entry file:

```json
{
  "schemaVersion": 1,
  "id": "example.format-text",
  "version": "1.0.0",
  "entry": "format-text.plugin.cjs",
  "permissions": []
}
```

The entry module exports `create(context)`, returning the API injected into a
cue. `context` includes the cue ID and the built-in `system` API. A plugin ID
may not replace a built-in or another installed plugin.

```js
module.exports = {
  create(context) {
    return Object.freeze({
      titleCase(value) {
        return String(value).replace(/\b\w/g, character => character.toUpperCase())
      },
    })
  },
}
```

Plugins run as trusted local JavaScript in the Ctrl agent. Install only code
you trust. The manifest controls discovery and API naming; it is not a security
sandbox.

Some local integrations require a named service permission. The current
personal plugin examples use `integration.goxlr`,
`integration.home-assistant-lights`, `integration.home-assistant-media`, and
`integration.game-launcher`. A granted service is available only to that
plugin as `context.services`; it is never exposed directly to a cue. Unsupported
permissions reject that plugin during loading.

Reload the Ctrl agent after adding or changing a plugin. The agent also watches
the plugins folder and schedules its normal profile refresh.
