import { describe, expect, test } from 'bun:test'
import {
  type ImagePackage,
  type Manifest,
  readImagePackages,
  selectPublished,
  toImagePackages,
} from './image-packages'

const image = { image: '4lch4/shion-bot', app: 'shion' }

describe('toImagePackages', () => {
  test('keeps the packages with a docker field and derives the Dockerfile path', () => {
    const manifests: Manifest[] = [
      { dir: 'packages/watcher-kit', name: 'watcher-kit', version: '0.1.0' },
      { dir: 'packages/gateway', name: 'shion', version: '0.2.1', docker: image },
    ]

    expect(toImagePackages(manifests)).toEqual([
      {
        name: 'shion',
        dir: 'packages/gateway',
        version: '0.2.1',
        image: '4lch4/shion-bot',
        app: 'shion',
        dockerfile: 'packages/gateway/Dockerfile',
      },
    ])
  })

  test('sorts by name, so the matrix and the output are stable', () => {
    const manifests: Manifest[] = [
      { dir: 'packages/b', name: 'bravo', version: '1.0.0', docker: image },
      { dir: 'packages/a', name: 'alpha', version: '1.0.0', docker: image },
    ]

    expect(toImagePackages(manifests).map(pkg => pkg.name)).toEqual(['alpha', 'bravo'])
  })

  test('fails when a docker field is incomplete', () => {
    expect(() =>
      toImagePackages([{ dir: 'packages/broken', name: 'broken', docker: { app: 'broken' } }]),
    ).toThrow('packages/broken/package.json needs name, version, docker.image and docker.app')
  })
})

describe('selectPublished', () => {
  const shion: ImagePackage = {
    name: 'shion',
    dir: 'packages/gateway',
    version: '0.2.1',
    image: '4lch4/shion-bot',
    app: 'shion',
    dockerfile: 'packages/gateway/Dockerfile',
  }

  const watcher: ImagePackage = {
    name: 'opencode-watcher',
    dir: 'packages/opencode-watcher',
    version: '0.1.0',
    image: '4lch4/shion-opencode-watcher',
    app: 'opencode-watcher',
    dockerfile: 'packages/opencode-watcher/Dockerfile',
  }

  const packages = [shion, watcher]

  test('uses the published version, not the one in the checkout', () => {
    expect(selectPublished(packages, [{ name: 'shion', version: '0.3.0' }])).toEqual([
      { ...shion, version: '0.3.0' },
    ])
  })

  test('drops packages that were not published', () => {
    expect(selectPublished(packages, [])).toEqual([])
  })

  test('drops version 0.0.0, the placeholder a new package starts at', () => {
    expect(selectPublished(packages, [{ name: 'opencode-watcher', version: '0.0.0' }])).toEqual([])
  })

  test('handles several packages at once', () => {
    expect(
      selectPublished(packages, [
        { name: 'shion', version: '0.3.0' },
        { name: 'opencode-watcher', version: '0.2.0' },
      ]).map(pkg => `${pkg.name}@${pkg.version}`),
    ).toEqual(['shion@0.3.0', 'opencode-watcher@0.2.0'])
  })
})

describe('readImagePackages', () => {
  test('finds the Gateway in this repository', async () => {
    expect(await readImagePackages()).toContainEqual({
      name: 'shion',
      dir: 'packages/gateway',
      version: '0.2.1',
      image: '4lch4/shion-bot',
      app: 'shion',
      dockerfile: 'packages/gateway/Dockerfile',
    })
  })
})

describe('the command line', () => {
  const script = new URL('./image-packages.ts', import.meta.url).pathname

  function run(...args: string[]) {
    return Bun.spawnSync(['bun', 'run', script, ...args], { stdout: 'pipe', stderr: 'pipe' })
  }

  test('accepts a known app', () => {
    const result = run('--app', 'shion')

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("deploys as 'shion'")
  })

  test('rejects an unknown app', () => {
    const result = run('--app', 'not-an-app')

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("Unknown app 'not-an-app'")
  })

  test('fails on an unknown option', () => {
    expect(run('--nope').exitCode).toBe(1)
  })
})
