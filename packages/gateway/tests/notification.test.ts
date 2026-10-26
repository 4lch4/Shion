import { describe, expect, test } from 'bun:test'
import { type Notification, toEmbed } from '../src/notification'

const notification: Notification = {
  source: 'grafana',
  level: 'info',
  text: 'disk almost full',
}

const sentAt = new Date('2026-10-26T18:30:45.999Z')

describe('toEmbed', () => {
  test("shows the send time as a Discord timestamp, in the reader's own timezone", () => {
    expect(toEmbed(notification, sentAt).toJSON()).toMatchObject({
      fields: [{ name: 'Sent', value: '<t:1793039445:f>' }],
    })
  })

  test('counts whole seconds, so milliseconds are floored', () => {
    expect(toEmbed(notification, sentAt).toJSON()).toMatchObject({
      fields: [{ name: 'Sent', value: '<t:1793039445:f>' }],
    })
    expect(toEmbed(notification, new Date('2026-10-26T18:30:45.000Z')).toJSON()).toMatchObject({
      fields: [{ name: 'Sent', value: '<t:1793039445:f>' }],
    })
  })

  test('leaves the time out of the embed timestamp, so it is not shown twice', () => {
    expect(toEmbed(notification, sentAt).toJSON()).not.toHaveProperty('timestamp')
  })
})
