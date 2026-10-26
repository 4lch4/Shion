export type Environment = Record<string, string | undefined>

export const defaultShionUrl = 'http://localhost:3000'

/** How often a Watcher polls, in seconds. */
export interface PollInterval {
  /** Used when the variable is unset. */
  readonly defaultSeconds: number
  /** Anything shorter is refused, to keep a typo from hammering the thing it watches. */
  readonly minimumSeconds: number
}

/** Where to send Notifications, and the token that gets them in. */
export interface ShionTarget {
  readonly apiToken: string
  readonly shionUrl: string
}

/** The first of `names` that holds a value. Empty and blank values count as unset. */
export function optionalValue(
  environment: Environment,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = environment[name]?.trim()

    if (value) {
      return value
    }
  }

  return undefined
}

/** `optionalValue`, but a Watcher with no value exits instead of running half configured. */
export function requireValue(
  environment: Environment,
  names: readonly string[],
  label: string,
): string {
  const value = optionalValue(environment, names)

  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}; set ${names[0]}.`)
}

/**
 * The Gateway's address and the shared API token. A trailing slash on the URL is dropped, so the
 * `createShionSender` can append `/v1/messages` without doubling it.
 */
export function loadShionTarget(environment: Environment = process.env): ShionTarget {
  return {
    apiToken: requireValue(environment, ['API_TOKEN', 'SHION_API_TOKEN'], 'API token'),
    shionUrl: (optionalValue(environment, ['SHION_URL']) ?? defaultShionUrl).replace(/\/+$/, ''),
  }
}

/**
 * Reads a poll interval from `name`, in seconds, and returns it in milliseconds. A value that is
 * not a whole number of at least `minimumSeconds` throws, so a bad config fails the deploy rather
 * than polling at the wrong rate.
 */
export function readPollIntervalMs(
  environment: Environment,
  name: string,
  interval: PollInterval,
): number {
  const value = optionalValue(environment, [name])

  if (value === undefined) {
    return interval.defaultSeconds * 1000
  }

  const seconds = Number(value)

  if (!Number.isInteger(seconds) || seconds < interval.minimumSeconds) {
    throw new Error(`Invalid ${name}; expected an integer of at least ${interval.minimumSeconds}.`)
  }

  return seconds * 1000
}
