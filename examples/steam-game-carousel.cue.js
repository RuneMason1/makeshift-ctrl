// Browse recently played Steam games with the leftmost knob and press to launch.
const requiredPlugins = ['gameLauncher']
const plugins = {}

function setup() {}

async function run(eventData) {
  return plugins.gameLauncher.handleEvent(eventData.event)
}

module.exports = {
  requiredPlugins,
  plugins,
  setup,
  run,
}
