import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || 'logs';

const otelFormat = winston.format((info) => {
  const span = trace.getSpan(context.active());
  if (span) {
    const spanContext = span.spanContext();
    info.trace_id = spanContext.traceId;
    info.span_id = spanContext.spanId;
    info.trace_flags = spanContext.traceFlags;
  }
  return info;
});

const consoleFormat = winston.format.combine(
  otelFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const fileRotateTransport = new (winston.transports as any).DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'vardiya-api-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: consoleFormat,
});

export const winstonLogger = winston.createLogger({
  level: LOG_LEVEL,
  format: consoleFormat,
  defaultMeta: { service: 'vardiya-api' },
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    fileRotateTransport,
  ],
});

export function recordException(
  error: Error,
  metadata?: Record<string, unknown>,
) {
  const span = trace.getSpan(context.active());
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
  winstonLogger.error('exception', {
    error: error.message,
    stack: error.stack,
    ...metadata,
  });
}
