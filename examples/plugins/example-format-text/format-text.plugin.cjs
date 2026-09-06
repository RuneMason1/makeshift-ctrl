module.exports = {
  create(context) {
    return Object.freeze({
      titleCase(value) {
        return String(value).replace(/\b\w/g, character => character.toUpperCase())
      },
      cueId() {
        return context.cueId
      },
    })
  },
}
