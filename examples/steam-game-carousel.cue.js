// Browse recently played Steam games with the leftmost knob and press to launch.
// Set to true for square cover art, or false for the fastest text-only display.
const SHOW_ARTWORK = false

const requiredPlugins = ['collectionProviders']
const requiredProviders = ['steam']
const requiredAssets = []
const requiredComponents = ['carousel']
const plugins = {}

function setup() {
  plugins.collectionProviders.get('steam').setArtworkEnabled(SHOW_ARTWORK)
}

async function run(eventData) {
  return plugins.collectionProviders.get('steam').handleEvent(eventData.event, SHOW_ARTWORK)
}

module.exports = {
  requiredPlugins,
  requiredAssets,
  requiredComponents,
  requiredProviders,
  plugins,
  setup,
  run,
}
