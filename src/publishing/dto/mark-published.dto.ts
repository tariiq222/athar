import { IsISO8601, IsOptional } from 'class-validator';

export class MarkPublishedDto {
  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}
