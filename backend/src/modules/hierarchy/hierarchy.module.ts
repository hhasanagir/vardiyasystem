import { Module } from '@nestjs/common';
import { HierarchyService } from './hierarchy.service';

@Module({
  providers: [HierarchyService],
  exports: [HierarchyService],
})
export class HierarchyModule {}
