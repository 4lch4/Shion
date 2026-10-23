import { describe, expect, test } from 'bun:test'
import { loadShionTarget, optionalValue, readPollIntervalMs, requireValue } from '../src/config'

describe('optionalValue', () => {
  test('takes the first name that holds a value', () => {
    expect(optionalValue({ API_TOKEN: 'one', SHION_API_TOKEN: 'two' }, ['API_TOKEN'])).toBe('one')
    expect(optionalValue({ SHION_API_TOKEN: 'two' }, ['API_TOKEN', 'SHION_API_TOKEN'])).toBe('two')
  })

  test('trims, and treats blank values as unset', () => {
    expect(optionalValue({ VALUE: '  padded  ' }, ['VALUE'])).toBe('padded')
    expect(optionalValue({ VALUE: '   ' }, ['VALUE'])).toBeUndefined()
    expect(optionalValue({}, ['VALUE'])).toBeUndefined()
  })
})

describe('requireValue', () => {
  test('returns the value when it is set', () => {
    expect(requireValue({ API_TOKEN: 'api-token' }, ['API_TOKEN'], 'API token')).toBe('api-token')
  })

  test('names the variable to set when it is missing', () => {
    expect(() => requireValue({}, ['API_TOKEN', 'SHION_API_TOKEN'], 'API token')).toThrow(
      'Missing API token; set API_TOKEN.',
    )
  })
})

describe('loadShionTarget', () => {
  test('applies the local default address', () => {
    expect(loadShionTarget({ API_TOKEN: 'api-token' })).toEqual({
      apiToken: 'api-token',
      shionUrl: 'http://localhost:3000',
    })
  })

  test('reads overrides and drops a trailing slash', () => {
    expect(
      loadShionTarget({
        SHION_API_TOKEN: 'api-token',
        SHION_URL: 'http://shion-gateway:3000/',
      }),
    ).toEqual({ apiToken: 'api-token', shionUrl: 'http://shion-gateway:3000' })
  })

  test('requires the API token', () => {
    expect(() => loadShionTarget({})).toThrow('API_TOKEN')
  })
})

describe('readPollIntervalMs', () => {
  const interval = { defaultSeconds: 300, minimumSeconds: 60 }

  test('uses the default when unset, in milliseconds', () => {
    expect(readPollIntervalMs({}, 'WATCHER_POLL_INTERVAL_SECONDS', interval)).toBe(300_000)
  })

  test('reads a whole number of seconds', () => {
    expect(
      readPollIntervalMs(
        { WATCHER_POLL_INTERVAL_SECONDS: '120' },
        'WATCHER_POLL_INTERVAL_SECONDS',
        interval,
      ),
    ).toBe(120_000)
  })

  test('refuses anything under the minimum, and anything that is not a whole number', () => {
    const name = 'WATCHER_POLL_INTERVAL_SECONDS'

    for (const value of ['30', '0', '-60', '1.5', 'soon']) {
      expect(() => readPollIntervalMs({ [name]: value }, name, interval)).toThrow(
        `Invalid ${name}; expected an integer of at least 60.`,
      )
    }
  })

  test('allows exactly the minimum', () => {
    expect(
      readPollIntervalMs({ WATCHER_POLL_INTERVAL_SECONDS: '60' }, 'WATCHER_POLL_INTERVAL_SECONDS', {
        defaultSeconds: 300,
        minimumSeconds: 60,
      }),
    ).toBe(60_000)
  })
})
