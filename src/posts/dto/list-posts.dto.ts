import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import type { PostStatus } from '../../generated/prisma/enums';
import type { PostPlatform } from '../post.types';

const POST_STATUSES: PostStatus[] = ['draft', 'pending_review', 'approved', 'published'];
const PLATFORMS: PostPlatform[] = ['linkedin', 'x'];

export class ListPostsDto {
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;

  @IsOptional()
  @IsIn(PLATFORMS)
  platform?: PostPlatform;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
