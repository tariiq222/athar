import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BrandKitDraftDto } from './brand-profile-draft.dto';

// US-2.3: partial edit. Every field optional, but if present it must be valid
// (e.g. tone, if sent, may not be empty; topics, if sent, may not be empty).
export class PatchBrandProfileDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tone?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  topics?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prohibitions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competitors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandKitDraftDto)
  brandKit?: BrandKitDraftDto;
}
