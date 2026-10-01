import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { EncryptionService } from '../encryption/encryption.service';
import {
  CLASSIFICATION_KEY,
  DataClassification,
} from './data-classification.decorator';

@Injectable()
export class DataClassificationInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private encryptionService: EncryptionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const classification = this.reflector.get<DataClassification>(
      CLASSIFICATION_KEY,
      context.getHandler(),
    );
    if (
      !classification ||
      classification === 'UNCLASSIFIED' ||
      classification === 'SYSTEM'
    ) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userClassification = user?.dataAccessLevel || 'INTERNAL';

    const canAccess = (required: string, userLevel: string): boolean => {
      const levels = [
        'PUBLIC',
        'INTERNAL',
        'CONFIDENTIAL',
        'RESTRICTED',
        'HIGHLY_RESTRICTED',
      ];
      return levels.indexOf(userLevel) >= levels.indexOf(required);
    };

    if (!canAccess(classification, userClassification)) {
      return next
        .handle()
        .pipe(
          map((data) => ({
            message: 'Access restricted',
            classificationRequired: classification,
          })),
        );
    }

    return next.handle();
  }
}
