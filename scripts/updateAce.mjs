import { readFile, writeFile } from 'fs/promises'
import fsEx from 'fs-extra'
import chalk from 'chalk'

// @ts-ignore
import * as semver from 'semver'

const rawFile = await readFile('package.json', 'utf-8')
const pubAceVersion = await readFile('public/ace-builds/aceversion', 'utf-8')
const packageJson = JSON.parse(rawFile)


const CWD = process.cwd()
const pkgAceVersion = packageJson.devDependencies['ace-builds']
const targetAceVersion = semver.minVersion(pkgAceVersion)

export async function updateAce() {
  console.log(`Updating public ace-builds to ${targetAceVersion.raw}`)

  if (semver.valid(targetAceVersion) === null) {
    console.log('invalid ace-builds version detected in package.json, exiting')
    process.exit(1)
  }
  let color = chalk.yellow

  if (semver.satisfies(targetAceVersion, pubAceVersion)) {
    color = chalk.green
  }

  console.log(`public/ace-builds version: ${color(pubAceVersion)}`)

  if (semver.satisfies(targetAceVersion, pubAceVersion)) {
    console.log('public/ace-builds is up to date')
    return 0
  }

  console.log('public/ace-builds is outdated, copying...')

  try {
    await fsEx.copy(
      `${CWD}/node_modules/ace-builds/src-min-noconflict`,
      `${CWD}/public/ace-builds/src-min-noconflict`,
    )
    console.log('Copying finished, updating aceversion file...')
    await writeFile('public/ace-builds/aceversion', targetAceVersion.raw)
    console.log('Finished.')
    return 0
  } catch (err) {
    console.log(err)
    console.log(`Error updating public ace-builds to '${targetAceVersion.raw}', exiting`)
    return 1
  }
}
