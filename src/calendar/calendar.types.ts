import type { SaudiOccasion } from '../occasions/occasion.types';
import type { CalendarPostSummary } from '../posts/post.types';

export type CalendarEntryType = 'occasion' | 'post';

export interface CalendarEntry {
  type: CalendarEntryType;
  date: string; // ISO date the entry appears on (yyyy-mm-dd)
  occasion?: SaudiOccasion; // set when type === 'occasion'
  post?: CalendarPostSummary; // set when type === 'post'
}
