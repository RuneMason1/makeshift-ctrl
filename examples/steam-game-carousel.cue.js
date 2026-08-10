// Browse recently played Steam games with the leftmost knob and press to launch.
// Set to true for square cover art, or false for the fastest text-only display.
const SHOW_ARTWORK = false

const requiredPlugins = ['gameLauncher']
const plugins = {}

function setup() {
  plugins.gameLauncher.setArtworkEnabled(SHOW_ARTWORK)
}

async function run(eventData) {
  return plugins.gameLauncher.handleEvent(eventData.event, SHOW_ARTWORK)
}

module.exports = {
  requiredPlugins,
  plugins,
  setup,
  run,
}
