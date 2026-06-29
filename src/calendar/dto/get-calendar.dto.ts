import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { SAUDI_OCCASION_KINDS, SaudiOccasionKind } from '../../occasions/occasion.types';
import type { PostPlatform } from '../../posts/post.types';

const PLATFORMS: PostPlatform[] = ['linkedin', 'x'];

export class GetCalendarDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: PostPlatform;

  @IsOptional()
  @IsIn(SAUDI_OCCASION_KINDS as readonly string[])
  kind?: SaudiOccasionKind;
}

export const MAX_CALENDAR_RANGE_DAYS = 92;
