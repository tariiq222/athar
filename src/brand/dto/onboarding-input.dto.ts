import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import type { Platform } from '../types';

export class AccountInputDto {
  @IsIn(['linkedin', 'x'])
  platform!: Platform;

  @IsOptional()
  @IsString()
  handle?: string;
}

export class OnboardingInputDto {
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AccountInputDto)
  accounts!: AccountInputDto[];

  @IsBoolean()
  consentAccepted!: boolean;
}
