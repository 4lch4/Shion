#!/usr/bin/env bun
/**
 * Fails when the Bun version is pinned to different versions in different
 * places.
 *
 * Dependabot's docker ecosystem only rewrites the `FROM oven/bun:` lines in the
 * Dockerfiles. Without this check the image, `.bun-version` and package.json
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
const dockerfiles = [
  ...new Bun.Glob('packages/*/Dockerfile').scanSync({ cwd: root.pathname }),
].sort()

if (dockerfiles.length === 0) {
  console.error('No packages/*/Dockerfile found.')
  process.exit(1)
}

const fromPins: Pin[] = []

for (const path of dockerfiles) {
  const dockerfile = await Bun.file(new URL(path, root)).text()
  const matches = [...dockerfile.matchAll(/^FROM oven\/bun:(\S+)/gm)]

  if (matches.length === 0) {
    console.error(`No "FROM oven/bun:<version>" lines found in ${path}.`)
    process.exit(1)
  }

  for (const match of matches) {
    const line = dockerfile.slice(0, match.index ?? 0).split('\n').length
    const tag = match[1] ?? ''
    fromPins.push(pin(`${path}:${line} FROM oven/bun:${tag}`, tag))
  }
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

  console.error('Bump every pin together; Dependabot only edits the Dockerfiles.')
  process.exit(1)
}

console.log(`Bun ${bunVersion} is pinned consistently in ${pins.length} places.`)
