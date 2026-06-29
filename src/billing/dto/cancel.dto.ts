import { IsBoolean } from 'class-validator';

export class CancelDto {
  @IsBoolean()
  confirm!: boolean;
}