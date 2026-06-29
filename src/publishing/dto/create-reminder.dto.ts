import { IsArray, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import type { NotificationChannelId } from '../publishing.types';

export class CreateReminderDto {
  @IsString()
  postId!: string;

  @IsOptional()
  @IsArray()
  @IsIn(['in_app', 'email'], { each: true })
  channels?: NotificationChannelId[];

  @IsOptional()
  @IsISO8601()
  remindAt?: string;
}
