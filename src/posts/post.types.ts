import type { PostStatus } from '../generated/prisma/enums';

export const EXCERPT_LENGTH = 120;

export type PostPlatform = 'linkedin' | 'x';

export interface CalendarPostSummary {
  id: string;
  platform: PostPlatform;
  status: PostStatus;
  scheduledAt: string | null;
  excerpt: string; // first ~120 chars of text
  hasImage: boolean;
}

export interface PostListItem {
  id: string;
  platform: PostPlatform;
  status: PostStatus;
  scheduledAt: string | null;
  text: string;
  hashtags: string[];
  hasImage: boolean;
  citationCount: number;
}

export interface PostImage {
  url: string;
  method: string;
}

export interface PostCitation {
  claim: string;
  sourceUrl: string;
}

export interface PostDetail {
  id: string;
  tenantId: string;
  brandProfileId: string;
  platform: PostPlatform;
  status: PostStatus;
  text: string;
  hashtags: string[];
  scheduledAt: string | null;
  createdAt: string;
  image: PostImage | null;
  citations: PostCitation[];
}