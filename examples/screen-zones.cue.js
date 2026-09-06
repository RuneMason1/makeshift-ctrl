const plugins = {}

const runtimeAssets = [{
  name: 'example.confirm',
  id: 8,
  format: 1,
  width: 32,
  height: 32,
  data: Buffer.alloc(128),
}]

function setup() {
  plugins.screenZones.text('upper-text', 'Ready')
  plugins.screenZones.status('bottom-left', {
    label: 'Example',
    percent: 50,
  })
}

function run() {
  plugins.screenZones.asset('center', 'example.confirm')
}

module.exports = { plugins, runtimeAssets, setup, run }
