import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationChannelId,
  type ReminderNotification,
  type DeliveryResult,
} from './notification.types';

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannel[],
  ) {}

  async dispatch(
    channelId: NotificationChannelId,
    payload: ReminderNotification,
  ): Promise<DeliveryResult> {
    const channel = this.channels.find((c) => c.id === channelId);
    if (!channel) {
      return { delivered: false, error: `unknown channel: ${channelId}` };
    }
    try {
      return await channel.send(payload);
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}
