const requiredPlugins = ['example.format-text']
const plugins = {}

function run() {
  return plugins['example.format-text'].titleCase('reusable cue plugin')
}

module.exports = { requiredPlugins, plugins, run }
