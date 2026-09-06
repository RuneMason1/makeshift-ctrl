// Browse recently played Steam games with the leftmost knob and press to launch.
// Set to true for square cover art, or false for the fastest text-only display.
const requiredPlugins = ['carousel', 'gameLauncher']
const requiredAssets = []
const requiredComponents = ['carousel']
const plugins = {}

async function run() {
  const session = await plugins.gameLauncher.createSession({ dial: 1, button: 1 })
  return plugins.carousel.open(session)
}

module.exports = {
  requiredPlugins,
  requiredAssets,
  requiredComponents,
  plugins,
  run,
}
