import { IsOptional, IsString } from 'class-validator';

export class UpdateAccountProfileDto {
  // platform is immutable after creation — intentionally not accepted here.
  @IsOptional()
  @IsString()
  handle?: string;
}
