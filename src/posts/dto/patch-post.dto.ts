import { Type } from 'class-transformer';
import { IsArray, IsIn, IsISO8601, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { PostStatus } from '../../generated/prisma/enums';

const POST_STATUSES: PostStatus[] = ['draft', 'pending_review', 'approved', 'published'];

class PostTransitionDto {
  @IsIn(POST_STATUSES)
  from!: PostStatus;

  @IsIn(POST_STATUSES)
  to!: PostStatus;
}

class PostImageDto {
  @IsString()
  url!: string;

  @IsString()
  @IsIn(['gpt-image', 'overlay-fallback'])
  method!: string;
}

export class PatchPostDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PostImageDto)
  image?: PostImageDto;

  @IsOptional()
  image_null?: boolean; // explicit null-erasure signal; documented below

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  scheduledAt_null?: boolean; // explicit null-erasure signal; documented below

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PostTransitionDto)
  transition?: PostTransitionDto;
}
