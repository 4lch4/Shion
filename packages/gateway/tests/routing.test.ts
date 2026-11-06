import { describe, expect, test } from 'bun:test'
import { ChannelType } from 'discord.js'
import type { Notification } from '../src/notification'
import { placeLabel, type Route, route } from '../src/routing'
import { fakeCategoryView, fakeChannel } from './support'

const notification: Notification = {
  source: '4lch4/Shion',
  level: 'info',
  text: 'CI failed',
}

function labels(trail: Route): string[] {
  return trail.chain.map(placeLabel)
}

describe('route', () => {
  test('sends a Topic with a channel to that channel', () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const trail = route({ ...notification, topic: 'deploy' }, fakeCategoryView([deploy]))

    expect(labels(trail)).toEqual(['#deploy', '#inbox', 'dm'])
    expect(trail.unrouted).toBe(false)
    expect(trail.chain[0]).toMatchObject({ kind: 'channel', channel: deploy })
  })

  test('sends a critical Notification to #alerts whatever its Topic', () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const alerts = fakeChannel({ id: '100000000000000002', name: 'alerts' })
    const trail = route(
      { ...notification, level: 'critical', topic: 'deploy' },
      fakeCategoryView([deploy, alerts]),
    )

    expect(labels(trail)).toEqual(['#alerts', '#inbox', 'dm'])
    expect(trail.unrouted).toBe(false)
  })

  test('sends a Notification with no Topic to #inbox', () => {
    const trail = route(notification, fakeCategoryView([]))

    expect(labels(trail)).toEqual(['#inbox', 'dm'])
    expect(trail.unrouted).toBe(false)
  })

  test('sends a Topic with no channel to #inbox and marks it unrouted', () => {
    const trail = route({ ...notification, topic: 'dpeloy' }, fakeCategoryView([]))

    expect(labels(trail)).toEqual(['#inbox', 'dm'])
    expect(trail.unrouted).toBe(true)
  })

  test('ignores a channel of the wrong type', () => {
    const voice = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      type: ChannelType.GuildVoice,
    })
    const trail = route({ ...notification, topic: 'deploy' }, fakeCategoryView([voice]))

    expect(labels(trail)).toEqual(['#inbox', 'dm'])
    expect(trail.unrouted).toBe(true)
  })

  test('ignores a text channel outside the Category', () => {
    const elsewhere = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      parentId: '999999999999999999',
    })
    const trail = route({ ...notification, topic: 'deploy' }, fakeCategoryView([elsewhere]))

    expect(labels(trail)).toEqual(['#inbox', 'dm'])
    expect(trail.unrouted).toBe(true)
  })

  test('takes the duplicate higher in the sidebar', () => {
    const lower = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 1 })
    const higher = fakeChannel({ id: '100000000000000002', name: 'deploy', rawPosition: 3 })
    const trail = route({ ...notification, topic: 'deploy' }, fakeCategoryView([higher, lower]))

    expect(trail.chain[0]).toMatchObject({ channel: lower })
  })

  test('breaks a duplicate tie with the lower ID', () => {
    const higherId = fakeChannel({ id: '900000000000000002', name: 'deploy', rawPosition: 1 })
    const lowerId = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 1 })
    const trail = route({ ...notification, topic: 'deploy' }, fakeCategoryView([higherId, lowerId]))

    expect(trail.chain[0]).toMatchObject({ channel: lowerId })
  })

  test('leaves a missing #alerts place unresolved, so Delivery can skip it', () => {
    const trail = route({ ...notification, level: 'critical' }, fakeCategoryView([]))

    expect(trail.chain[0]).toMatchObject({ kind: 'channel', name: 'alerts', channel: undefined })
  })
})
