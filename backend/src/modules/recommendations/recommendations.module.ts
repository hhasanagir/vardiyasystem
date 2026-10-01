import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { SchedulingInsightsService } from './scheduling-insights.service';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, SchedulingInsightsService],
  exports: [RecommendationsService, SchedulingInsightsService],
})
export class RecommendationsModule {}
