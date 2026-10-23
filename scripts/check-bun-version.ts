#!/usr/bin/env bun
/**
 * Fails when the Bun version is pinned to different versions in different
 * places.
 *
 * Dependabot's docker ecosystem only rewrites the `FROM oven/bun:` lines in the
 * Dockerfile. Without this check the image, `.bun-version` and package.json
 * drift apart, and a security fix in Bun reaches the image while the rest of
 * the toolchain still claims the old version.
 */
import pkg from '../package.json'

const root = new URL('../', import.meta.url)
const semver = /\d+\.\d+\.\d+/

interface Pin {
  name: string
  version: string
}

function pin(name: string, raw: string): Pin {
  const found = raw.match(semver)

  if (!found) {
    throw new Error(`${name} does not name a version: ${JSON.stringify(raw)}`)
  }

  return { name, version: found[0] }
}

const bunVersion = (await Bun.file(new URL('.bun-version', root)).text()).trim()
const dockerfile = await Bun.file(new URL('Dockerfile', root)).text()
const fromPins = [...dockerfile.matchAll(/^FROM oven\/bun:(\S+)/gm)].map(match => {
  const line = dockerfile.slice(0, match.index ?? 0).split('\n').length
  return pin(`Dockerfile:${line} FROM oven/bun:${match[1]}`, match[1])
})

if (fromPins.length === 0) {
  console.error('No "FROM oven/bun:<version>" lines found in the Dockerfile.')
  process.exit(1)
}

const pins: Pin[] = [
  pin('.bun-version', bunVersion),
  ...fromPins,
  pin('package.json packageManager', String(pkg.packageManager)),
  pin('package.json engines.bun', String(pkg.engines.bun)),
]

const mismatched = pins.filter(entry => entry.version !== bunVersion)

if (mismatched.length > 0) {
  console.error(`Bun ${bunVersion} is pinned in .bun-version, but these disagree:`)

  for (const entry of mismatched) {
    console.error(`  ${entry.name}: ${entry.version}`)
  }

  console.error('Bump every pin together; Dependabot only edits the Dockerfile.')
  process.exit(1)
}

console.log(`Bun ${bunVersion} is pinned consistently in ${pins.length} places.`)
