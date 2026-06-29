import type { Platform } from '../config/platform-limits';

export type NotificationChannelId = 'in_app' | 'email';
export type ReminderStatus = 'scheduled' | 'sent' | 'failed' | 'cancelled';

export interface ExportLink {
  url: string;
  placement: 'in_body' | 'first_reply';
}

export interface ExportPayload {
  postId: string;
  platform: Platform;
  formattedText: string; // paste-ready: body + hashtags in platform order
  imageUrl?: string; // ImageAsset.url when present (separate download button)
  deepLink: string; // opens composer / platform
  link?: ExportLink; // external link and where it goes
  charCount: number; // weighted count (twitter-text for X)
  limitMax: number; // max chars from platform-limits
  notes: string[]; // manual guidance for the user
}

export interface MarkPublishedResult {
  postId: string;
  status: 'published';
  publishedAt: string; // ISO
}

export interface ReminderDto {
  id: string;
  tenantId: string;
  postId: string;
  channel: NotificationChannelId;
  remindAt: string; // ISO
  status: ReminderStatus;
  createdAt: string; // ISO
}
