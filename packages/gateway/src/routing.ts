import type { CategoryChannel, CategoryView } from './category'
import type { Notification } from './notification'

export const alertsChannelName = 'alerts'
export const inboxChannelName = 'inbox'

export interface ChannelPlace {
  readonly kind: 'channel'
  readonly name: string
  readonly channel: CategoryChannel | undefined
}

export interface DirectMessagePlace {
  readonly kind: 'dm'
}

export type Place = ChannelPlace | DirectMessagePlace

export interface Route {
  readonly chain: Place[]
  readonly unrouted: boolean
}

export function placeLabel(place: Place): string {
  return place.kind === 'dm' ? 'dm' : `#${place.name}`
}

function channelPlace(category: CategoryView, name: string): ChannelPlace {
  return { kind: 'channel', name, channel: category.textChannel(name) }
}

// The intended place, then #inbox unless that's already the intended place, then the DM. An
// unrouted Notification is one whose Topic has no channel: #inbox is its normal destination, not a
// fallback, so it never sets `rerouted`. Only a `critical` Level outranks the Topic.
export function route(notification: Notification, category: CategoryView): Route {
  if (notification.level === 'critical') {
    return {
      chain: [
        channelPlace(category, alertsChannelName),
        channelPlace(category, inboxChannelName),
        { kind: 'dm' },
      ],
      unrouted: false,
    }
  }

  if (notification.topic !== undefined) {
    const topicChannel = category.textChannel(notification.topic)

    if (topicChannel !== undefined) {
      return {
        chain: [
          { kind: 'channel', name: notification.topic, channel: topicChannel },
          channelPlace(category, inboxChannelName),
          { kind: 'dm' },
        ],
        unrouted: false,
      }
    }

    return {
      chain: [channelPlace(category, inboxChannelName), { kind: 'dm' }],
      unrouted: true,
    }
  }

  return {
    chain: [channelPlace(category, inboxChannelName), { kind: 'dm' }],
    unrouted: false,
  }
}
