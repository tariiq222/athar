import { Injectable } from '@nestjs/common';
import * as twitter from 'twitter-text';
import { getLimit, type Platform } from '../config/platform-limits';

@Injectable()
export class DeepLinkBuilder {
  build(platform: Platform, formattedText: string): string {
    if (platform === 'linkedin') {
      // No reliable URL prefill for a normal post: open the composer; user pastes.
      return 'https://www.linkedin.com/feed/?shareActive=true';
    }
    // X web intent supports prefilled text within URL/length budget.
    const fits = twitter.parseTweet(formattedText).weightedLength <= getLimit('x').maxChars;
    if (fits) {
      return `https://x.com/intent/post?text=${encodeURIComponent(formattedText)}`;
    }
    return 'https://x.com/intent/post';
  }
}
