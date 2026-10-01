import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { winstonLogger } from '../logger/winston-logger';
import { ErrorCode } from './error-codes';
import { StaleVersionError } from '../modules/schedules/domain/errors/schedule-errors';

const PRISMA_ERROR_MAP: Record<
  string,
  { status: number; code: ErrorCode; message: string }
> = {
  P2000: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INPUT_TOO_LONG,
    message: 'Sağlanan değer çok uzun',
  },
  P2001: {
    status: HttpStatus.NOT_FOUND,
    code: ErrorCode.NOT_FOUND,
    message: 'Kayıt bulunamadı',
  },
  P2002: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.ALREADY_EXISTS,
    message: 'Bu kayıt zaten mevcut',
  },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'İlişkili kayıt bulunamadı',
  },
  P2004: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.CONFLICT,
    message: 'Veritabanı kısıtlaması ihlal edildi',
  },
  P2011: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.REQUIRED_FIELD_MISSING,
    message: 'Null kısıtlaması ihlal edildi',
  },
  P2012: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'Unique kısıtlaması ihlal edildi',
  },
  P2014: {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.CONFLICT,
    message: 'İlişkili kayıt değişikliği reddedildi',
  },
  P2015: {
    status: HttpStatus.NOT_FOUND,
    code: ErrorCode.NOT_FOUND,
    message: 'İlişkili kayıt bulunamadı',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: ErrorCode.NOT_FOUND,
    message: 'Güncellenecek kayıt bulunamadı',
  },
};

const DOMAIN_ERROR_MAP: Record<string, { status: number; code: ErrorCode }> = {
  StaleVersionError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.SCHEDULE_VERSION_CONFLICT,
  },
  ScheduleLockError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.SCHEDULE_LOCKED,
  },
  ScheduleAlreadyPublishedError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.SCHEDULE_ALREADY_PUBLISHED,
  },
  InvalidScheduleStateError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.SCHEDULE_STATE_CONFLICT,
  },
  AssignmentConflictError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.ASSIGNMENT_CONFLICT,
  },
  InsufficientRestError: {
    status: HttpStatus.CONFLICT,
    code: ErrorCode.INSUFFICIENT_REST,
  },
  QualificationRequiredError: {
    status: HttpStatus.FORBIDDEN,
    code: ErrorCode.QUALIFICATION_REQUIRED,
  },
  MasterDataMutationNotAllowedError: {
    status: HttpStatus.FORBIDDEN,
    code: ErrorCode.MASTER_DATA_IMMUTABLE,
  },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const errorId = request.correlationId || crypto.randomUUID().slice(0, 8);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.INTERNAL_ERROR;
    let message = 'Sunucuda bir hata oluştu';
    let errors: string[] | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
        code =
          status >= 500
            ? ErrorCode.INTERNAL_ERROR
            : ErrorCode.VALIDATION_FAILED;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const body = exResponse as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          errors = body.message;
          message = body.message[0];
        } else {
          message = typeof body.message === 'string' ? body.message : message;
        }
        if (typeof body.code === 'string') {
          code = body.code as ErrorCode;
        } else if (typeof body.error === 'string') {
          code = body.error as ErrorCode;
        }
      }
    } else if (exception instanceof StaleVersionError) {
      status = HttpStatus.CONFLICT;
      code = ErrorCode.SCHEDULE_VERSION_CONFLICT;
      message =
        'Schedule has been modified by another user. Please refresh and try again.';
      details = { expectedVersion: undefined, actualVersion: undefined };
    } else if (exception instanceof Error && DOMAIN_ERROR_MAP[exception.name]) {
      const mapping = DOMAIN_ERROR_MAP[exception.name];
      status = mapping.status;
      code = mapping.code;
      message = exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapping = PRISMA_ERROR_MAP[exception.code];
      if (mapping) {
        status = mapping.status;
        code = mapping.code;
        message = mapping.message;
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = ErrorCode.DATABASE_ERROR;
        message = 'Veritabanı hatası';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.VALIDATION_FAILED;
      message = 'Geçersiz veritabanı sorgusu';
    }

    if (status >= 500) {
      winstonLogger.error('internal_server_error', {
        errorId,
        method: request.method,
        url: request.url,
        status,
        code,
        exception:
          exception instanceof Error ? exception.message : 'Unknown error',
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    } else if (status >= 400) {
      winstonLogger.warn('client_error', {
        errorId,
        method: request.method,
        url: request.url,
        status,
        code,
        message,
        ...(exception instanceof Prisma.PrismaClientKnownRequestError
          ? { prismaCode: exception.code }
          : {}),
      });
    }

    const responseBody: Record<string, unknown> = {
      statusCode: status,
      code,
      message,
      correlationId: errorId,
    };

    if (errors && errors.length > 1) {
      responseBody.errors = errors;
    }
    if (details) {
      responseBody.details = details;
    }

    response.status(status).json(responseBody);
  }
}
