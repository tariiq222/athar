import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AccountInputDto } from './onboarding-input.dto';

export class BrandKitDraftDto {
  @IsArray()
  @IsString({ each: true })
  colors!: string[];

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsString()
  visualStyle!: string;

  @IsString()
  @IsNotEmpty()
  font!: string;
}

export class BrandProfileDraftDto {
  @IsString()
  @IsNotEmpty()
  tone!: string;

  @IsString()
  audience!: string;

  @IsString()
  goals!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  topics!: string[];

  @IsArray()
  @IsString({ each: true })
  prohibitions!: string[];

  @IsArray()
  @IsString({ each: true })
  competitors!: string[];

  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @ValidateNested()
  @Type(() => BrandKitDraftDto)
  brandKit!: BrandKitDraftDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccountInputDto)
  accounts!: AccountInputDto[];
}