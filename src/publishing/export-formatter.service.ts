import { Injectable } from '@nestjs/common';
import * as twitter from 'twitter-text';
import { getLimit, type Platform } from '../config/platform-limits';
import type { ExportLink } from './publishing.types';
import { exceedsPlatformLimit } from '../common/errors/error-envelope';

export interface FormatInput {
  platform: Platform;
  text: string;
  hashtags: string[];
  link?: string;
}

export interface FormatResult {
  formattedText: string;
  charCount: number;
  limitMax: number;
  link?: ExportLink;
  notes: string[];
}

@Injectable()
export class ExportFormatter {
  format(input: FormatInput): FormatResult {
    const limit = getLimit(input.platform);
    const limitMax = limit.maxChars;
    const notes: string[] = [];
    const parts: string[] = [input.text.trim()];

    if (input.platform === 'linkedin') {
      let link: ExportLink | undefined;
      if (input.hashtags.length > 0) parts.push(input.hashtags.join(' '));
      if (input.link) {
        parts.push(input.link);
        link = { url: input.link, placement: 'in_body' };
        notes.push('احذف بطاقة المعاينة (preview card) — تخفض الوصول.');
      }
      const formattedText = parts.filter(Boolean).join('\n\n');
      const charCount = formattedText.length;
      if (charCount > limitMax) throw exceedsPlatformLimit(charCount, limitMax);
      return { formattedText, charCount, limitMax, link, notes };
    }

    // X: link in a separate reply (kept OUT of formattedText); weighted count.
    let link: ExportLink | undefined;
    if (input.hashtags.length > 0) parts.push(input.hashtags.join(' '));
    if (input.link) {
      link = { url: input.link, placement: 'first_reply' };
      notes.push('ضع الرابط في أول ردّ (reply) لا في المتن — الروابط تخفض الوصول.');
    }
    const formattedText = parts.filter(Boolean).join('\n\n');
    const charCount = twitter.parseTweet(formattedText).weightedLength;
    if (charCount > limitMax) throw exceedsPlatformLimit(charCount, limitMax);
    return { formattedText, charCount, limitMax, link, notes };
  }
}
