import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { SAUDI_OCCASION_KINDS, SaudiOccasionKind } from '../occasion.types';

export class ListOccasionsDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsIn(SAUDI_OCCASION_KINDS as readonly string[])
  kind?: SaudiOccasionKind;
}
