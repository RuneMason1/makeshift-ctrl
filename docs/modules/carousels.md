# Carousels

A carousel is a generic full-screen collection session. Firmware renders cards
and emits selection/activation events; it never knows a provider name, account,
URL, or household-specific behavior. Ctrl's generic `carousel` plugin validates
the session, transfers its bounded item list, explicitly binds the requested
input, and owns the active-session lifecycle.

Only one session is active because the device has one full-screen collection
renderer. Inputs are never automatically claimed: each cue supplies its exact
rotary and button.

## Cue contract

A cue may build a session itself or obtain one from an integration plugin:

```js
const requiredPlugins = ['carousel', 'myCollection']
const plugins = {}

async function run() {
  const session = await plugins.myCollection.createSession({ dial: 2, button: 2 })
  return plugins.carousel.open(session)
}
```

```js
{
  id: 'safe-session-id',
  input: { dial: 2, button: 2 },
  items: [{ itemId: 'safe-id', title: 'Display title' }],
  loadArtwork: async item => {},
  activate: async item => {},
  preload: async () => {},
}
```

`itemId` values are unique ASCII identifiers up to 12 characters; a session has
1-64 items. Callbacks are optional. `loadArtwork` receives the selected item,
`activate` receives the confirmed item, and `preload` can prepare initial
content without blocking the device connection.

## Plugins and ownership

Integration plugins supply data and actions, not host-global providers. A Plex
plugin can obtain a resume queue and return a session; a Steam plugin can return
launch items and artwork callbacks. The cue chooses the control and opens the
session. This permits entirely local user-defined carousels while credentials
and integration APIs remain inside private plugins.
