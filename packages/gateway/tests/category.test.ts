import { describe, expect, test } from 'bun:test'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { fakeCategoryView, fakeChannel } from './support'

describe('CategoryView.textChannel', () => {
  test('matches a text channel by exact name', () => {
    const deploy = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const view = fakeCategoryView([deploy])

    expect(view.textChannel('deploy')).toBe(deploy)
    expect(view.textChannel('deploys')).toBeUndefined()
    expect(view.textChannel('Deploy')).toBeUndefined()
  })

  test('ignores a channel that is not a guild text channel', () => {
    const voice = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      type: ChannelType.GuildVoice,
    })

    expect(fakeCategoryView([voice]).textChannel('deploy')).toBeUndefined()
  })

  test('takes the duplicate with the lowest rawPosition', () => {
    const first = fakeChannel({ id: '100000000000000002', name: 'deploy', rawPosition: 2 })
    const second = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 5 })

    expect(fakeCategoryView([second, first]).textChannel('deploy')).toBe(first)
  })

  test('breaks a rawPosition tie with the lower ID, compared as BigInt', () => {
    const higher = fakeChannel({ id: '900000000000000002', name: 'deploy', rawPosition: 2 })
    const lower = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 2 })

    expect(fakeCategoryView([higher, lower]).textChannel('deploy')).toBe(lower)
  })
})

describe('CategoryView.missingPermissions', () => {
  test('reports nothing when the bot has all three', () => {
    const channel = fakeChannel({ id: '100000000000000001', name: 'deploy' })

    expect(fakeCategoryView([channel]).missingPermissions(channel)).toEqual([])
  })

  test('lists the missing permissions in a fixed order', () => {
    const channel = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      permissions: PermissionFlagsBits.ViewChannel,
    })

    expect(fakeCategoryView([channel]).missingPermissions(channel)).toEqual([
      'Send Messages',
      'Embed Links',
    ])
  })

  test('treats null permissions as all three missing', () => {
    const channel = fakeChannel({ id: '100000000000000001', name: 'deploy', permissions: null })

    expect(fakeCategoryView([channel]).missingPermissions(channel)).toEqual([
      'View Channel',
      'Send Messages',
      'Embed Links',
    ])
  })

  test('treats a missing bot user as all three missing', () => {
    const channel = fakeChannel({ id: '100000000000000001', name: 'deploy' })
    const view = fakeCategoryView([channel], { bot: null })

    expect(view.missingPermissions(channel)).toEqual([
      'View Channel',
      'Send Messages',
      'Embed Links',
    ])
  })
})

describe('CategoryView.health', () => {
  test('reports missing channels when the Category is not in the cache', () => {
    const view = fakeCategoryView([], { found: false })

    expect(view.health()).toEqual({
      id: view.id,
      found: false,
      alerts: { state: 'missing' },
      inbox: { state: 'missing' },
      unusableTopicChannels: [],
    })
  })

  test('reports alerts and inbox as ok, missing or unusable', () => {
    const alerts = fakeChannel({ id: '100000000000000001', name: 'alerts' })
    const inbox = fakeChannel({
      id: '100000000000000002',
      name: 'inbox',
      permissions: PermissionFlagsBits.ViewChannel,
    })

    expect(fakeCategoryView([alerts, inbox]).health()).toMatchObject({
      found: true,
      alerts: { state: 'ok' },
      inbox: { state: 'unusable', missing: ['Send Messages', 'Embed Links'] },
    })

    expect(fakeCategoryView([alerts]).health()).toMatchObject({ inbox: { state: 'missing' } })
  })

  test('lists unusable Topic channels and ignores a shadowed duplicate', () => {
    const winner = fakeChannel({
      id: '100000000000000001',
      name: 'deploy',
      rawPosition: 1,
      permissions: PermissionFlagsBits.ViewChannel,
    })
    const shadowed = fakeChannel({ id: '100000000000000002', name: 'deploy', rawPosition: 2 })
    const alerts = fakeChannel({ id: '100000000000000003', name: 'alerts' })
    const inbox = fakeChannel({ id: '100000000000000004', name: 'inbox' })
    const view = fakeCategoryView([winner, shadowed, alerts, inbox])

    expect(view.health().unusableTopicChannels).toEqual([
      { name: 'deploy', missing: ['Send Messages', 'Embed Links'] },
    ])
  })

  test('does not list a shadowed duplicate that is unusable when the winner is fine', () => {
    const winner = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 1 })
    const shadowed = fakeChannel({
      id: '100000000000000002',
      name: 'deploy',
      rawPosition: 2,
      permissions: 0n,
    })

    expect(fakeCategoryView([winner, shadowed]).health().unusableTopicChannels).toEqual([])
  })
})

describe('CategoryView.warnings', () => {
  test('warns once about each missing channel', () => {
    const lines = fakeCategoryView([]).warnings()

    expect(lines.filter(line => line.includes('No #alerts'))).toHaveLength(1)
    expect(lines.filter(line => line.includes('No #inbox'))).toHaveLength(1)
  })

  test('warns about missing permissions once per channel', () => {
    const alerts = fakeChannel({
      id: '100000000000000001',
      name: 'alerts',
      permissions: PermissionFlagsBits.ViewChannel,
    })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const deploy = fakeChannel({
      id: '100000000000000003',
      name: 'deploy',
      permissions: PermissionFlagsBits.SendMessages,
    })
    const lines = fakeCategoryView([alerts, inbox, deploy]).warnings()

    expect(lines.filter(line => line.startsWith('#alerts:'))).toEqual([
      '#alerts: Missing Permissions (Send Messages, Embed Links).',
    ])
    expect(lines.filter(line => line.startsWith('#deploy:'))).toEqual([
      '#deploy: Missing Permissions (View Channel, Embed Links).',
    ])
  })

  test('warns when there are no Topic channels', () => {
    const alerts = fakeChannel({ id: '100000000000000001', name: 'alerts' })
    const inbox = fakeChannel({ id: '100000000000000002', name: 'inbox' })
    const lines = fakeCategoryView([alerts, inbox]).warnings()

    expect(lines.filter(line => line.includes('No Topic channels'))).toHaveLength(1)
  })

  test('warns which duplicate wins, once per shared name', () => {
    const winner = fakeChannel({ id: '100000000000000001', name: 'deploy', rawPosition: 1 })
    const shadowed = fakeChannel({ id: '100000000000000002', name: 'deploy', rawPosition: 4 })
    const lines = fakeCategoryView([shadowed, winner]).warnings()

    expect(lines.filter(line => line.includes('2 text channels are named #deploy'))).toEqual([
      '2 text channels are named #deploy; the one at position 1 (ID 100000000000000001) wins.',
    ])
  })

  test('warns when the Category is gone from the cache', () => {
    const lines = fakeCategoryView([], { found: false }).warnings()

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('not in the Discord cache')
  })
})
