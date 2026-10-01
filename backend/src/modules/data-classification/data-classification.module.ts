import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataClassificationInterceptor } from './data-classification.interceptor';

@Global()
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: DataClassificationInterceptor,
    },
  ],
})
export class DataClassificationModule {}
