#!/usr/bin/env bun
/**
 * Lists the workspace packages that ship a Docker image.
 *
 * A package opts in with a `docker` field in its package.json:
 *
 *   "docker": { "image": "4lch4/shion-bot", "app": "shion" }
 *
 * `image` is the Docker Hub repository, and `app` is the folder `deploy-app`
 * owns on the server. The Dockerfile is always `packages/<dir>/Dockerfile`,
 * built with the repository root as the context. Packages without the field,
 * such as a shared library, have no image.
 *
 * Usage:
 *   bun run scripts/image-packages.ts
 *   bun run scripts/image-packages.ts --published '[{"name":"shion","version":"0.3.0"}]'
 *   bun run scripts/image-packages.ts --app shion
 *
 * The first prints every image package. The second filters to the packages
 * changesets/action published, dropping version 0.0.0, which is the
 * placeholder a new package starts at. The third exits non-zero unless the app
 * is one this repository deploys, which is how deploy.yml validates a manual
 * run's free text.
 */
export interface PublishedPackage {
  name: string
  version: string
}

export interface ImagePackage {
  name: string
  dir: string
  version: string
  image: string
  app: string
  dockerfile: string
}

export interface Manifest {
  dir: string
  name?: string
  version?: string
  docker?: {
    image?: string
    app?: string
  }
}

const root = new URL('..', import.meta.url)

/** Keeps the packages with a complete `docker` field, sorted by name. */
export function toImagePackages(manifests: Manifest[]): ImagePackage[] {
  const packages: ImagePackage[] = []

  for (const manifest of manifests) {
    const docker = manifest.docker

    if (!docker) {
      continue
    }

    if (!manifest.name || !manifest.version || !docker.image || !docker.app) {
      throw new Error(
        `${manifest.dir}/package.json needs name, version, docker.image and docker.app to ship an image`,
      )
    }

    packages.push({
      name: manifest.name,
      dir: manifest.dir,
      version: manifest.version,
      image: docker.image,
      app: docker.app,
      dockerfile: `${manifest.dir}/Dockerfile`,
    })
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

/** Filters to what changesets/action published, at the version it published. */
export function selectPublished(
  packages: ImagePackage[],
  published: PublishedPackage[],
): ImagePackage[] {
  const versions = new Map(published.map(entry => [entry.name, entry.version]))

  return packages.flatMap(pkg => {
    const version = versions.get(pkg.name)

    // 0.0.0 is the placeholder a package starts at, not a release.
    return version && version !== '0.0.0' ? [{ ...pkg, version }] : []
  })
}

/** Reads every workspace package manifest, with its directory alongside it. */
export async function readImagePackages(): Promise<ImagePackage[]> {
  const files = [...new Bun.Glob('packages/*/package.json').scanSync({ cwd: root.pathname })].sort()
  const manifests: Manifest[] = []

  for (const path of files) {
    const manifest = (await Bun.file(new URL(path, root)).json()) as Omit<Manifest, 'dir'>
    manifests.push({ dir: path.replace(/\/package\.json$/, ''), ...manifest })
  }

  return toImagePackages(manifests)
}

function parsePublished(raw: string): PublishedPackage[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`--published is not valid JSON: ${raw}`)
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      entry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PublishedPackage).name === 'string' &&
        typeof (entry as PublishedPackage).version === 'string',
    )
  ) {
    throw new Error('--published must be a JSON array of { name, version }')
  }

  return parsed as PublishedPackage[]
}

const usage = `Usage:
  bun run scripts/image-packages.ts
  bun run scripts/image-packages.ts --published '<json>'
  bun run scripts/image-packages.ts --app <name>`

async function main(): Promise<void> {
  const [flag, value, ...rest] = process.argv.slice(2)

  if (rest.length > 0) {
    throw new Error(`Unexpected arguments: ${rest.join(' ')}\n\n${usage}`)
  }

  const packages = await readImagePackages()

  switch (flag) {
    case undefined:
      console.log(JSON.stringify(packages, null, 2))
      return

    case '--published':
      if (value === undefined) {
        throw new Error(`--published needs the action's published-packages output\n\n${usage}`)
      }
      console.log(JSON.stringify(selectPublished(packages, parsePublished(value)), null, 2))
      return

    case '--app': {
      const found = packages.find(pkg => pkg.app === value)

      if (!found) {
        const known = packages.map(pkg => pkg.app).join(', ') || 'none'
        throw new Error(`Unknown app '${value}'. Known apps: ${known}`)
      }

      console.log(`${found.name} (${found.image}) deploys as '${found.app}'`)
      return
    }

    default:
      throw new Error(`Unknown option '${flag}'\n\n${usage}`)
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
