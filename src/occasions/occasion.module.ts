import { Module } from '@nestjs/common';
import { OccasionService } from './occasion.service';

@Module({
  providers: [OccasionService],
  exports: [OccasionService],
})
export class OccasionModule {}
