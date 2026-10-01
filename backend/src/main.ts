import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { winstonLogger } from './logger/winston-logger';
import { VaultService } from './vault/vault.service';
import { AlertingService } from './alerting/alerting.service';
import { CorrelationService } from './correlation/correlation.service';
import { MetricsService } from './metrics/metrics.service';
import { HealthMonitorService } from './modules/health/health-monitor.service';
import { validateStartupConfig } from './config/env.config';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  validateStartupConfig(configService);
  const isProduction = configService.get('NODE_ENV') === 'production';
  const frontendUrl = configService.get(
    'FRONTEND_URL',
    'http://localhost:4200',
  );

  const trustLevel = configService.get<number>('TRUST_PROXY_LEVEL', 1);
  app.getHttpAdapter().getInstance().set('trust proxy', trustLevel);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  app.use(compression());

  const cookieSecret = configService.get<string>('COOKIE_SECRET');
  app.use(cookieParser(cookieSecret));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", frontendUrl],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      xFrameOptions: { action: 'deny' },
    }),
  );

  const correlationService = app.get(CorrelationService);
  const healthMonitor = app.get(HealthMonitorService);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(correlationService, healthMonitor),
    new MetricsInterceptor(app.get(MetricsService)),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
      stopAtFirstError: true,
    }),
  );

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-csrf-token',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['X-Correlation-Id'],
  });

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VardiyaOS API')
      .setDescription('Radyoloji Vardiya Yönetim Sistemi API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const vaultService = app.get(VaultService);
  await vaultService.onModuleInit();

  const alertingService = app.get(AlertingService);

  const port = configService.get('PORT', 3000);
  await app.listen(port);

  winstonLogger.info('server_started', { port, nodeEnv: process.env.NODE_ENV });
  logger.log(`VardiyaOS API running on http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
  logger.log(`Metrics at http://localhost:${port}/api/v1/metrics`);

  await alertingService.sendAlert({
    title: 'VardiyaOS Started',
    message: `API server started on port ${port} (${process.env.NODE_ENV || 'development'})`,
    severity: 'info',
    source: 'bootstrap',
    metadata: {
      port,
      nodeVersion: process.version,
      platform: process.platform,
    },
  });

  const shutdownHandler = async (signal: string) => {
    winstonLogger.info('shutdown_initiated', {
      signal,
      uptime: process.uptime(),
    });
    logger.log(`Received ${signal}. Starting graceful shutdown...`);

    try {
      await app.close();
      winstonLogger.info('shutdown_complete', { signal });
      logger.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      winstonLogger.error('shutdown_error', { error: (err as Error).message });
      logger.error(`Shutdown error: ${(err as Error).message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
}

bootstrap().catch((err) => {
  winstonLogger.error('bootstrap_failed', {
    error: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});
