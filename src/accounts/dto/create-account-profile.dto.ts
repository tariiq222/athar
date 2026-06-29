import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAccountProfileDto {
  @IsNotEmpty()
  @IsString()
  brandProfileId!: string;

  @IsIn(['linkedin', 'x'])
  platform!: 'linkedin' | 'x';

  @IsOptional()
  @IsString()
  handle?: string;
}
