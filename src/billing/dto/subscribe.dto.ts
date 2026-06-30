import { IsIn, IsString } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @IsIn(['business'])
  planCode!: 'business';

  @IsString()
  @IsIn(['monthly', 'annual'])
  cycle!: 'monthly' | 'annual';
}
