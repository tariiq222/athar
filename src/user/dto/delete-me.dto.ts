import { IsBoolean } from 'class-validator';

export class DeleteMeDto {
  @IsBoolean()
  confirm!: boolean;
}