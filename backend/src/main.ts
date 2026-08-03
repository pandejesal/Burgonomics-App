import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '@common/interceptors/correlation-id.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { bootstrapTracing } from '@infra/observability/tracing/otel.bootstrap';
import type { AppConfig } from '@config/app.config';
import type { SwaggerConfig } from '@config/swagger.config';

async function bootstrap(): Promise<void> {
  await bootstrapTracing();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const appCfg = config.getOrThrow<AppConfig>('app');
  const swaggerCfg = config.getOrThrow<SwaggerConfig>('swagger');

  app.setGlobalPrefix(appCfg.globalPrefix, { exclude: ['health', 'health/(.*)', 'metrics'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'v' });

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: appCfg.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(
    new CorrelationIdInterceptor(),
    new TimeoutInterceptor(),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Logger)));

  if (swaggerCfg.enabled) {
    const doc = new DocumentBuilder()
      .setTitle('Burgonomics Backend')
      .setDescription('Backend-for-Frontend for the Burgonomics mobile application.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(swaggerCfg.path, app, SwaggerModule.createDocument(app, doc));
  }

  app.enableShutdownHooks();

  await app.listen(appCfg.port, '0.0.0.0');
  const logger = app.get(Logger);
  logger.log(`Burgonomics Backend listening on :${appCfg.port} (${appCfg.env})`, 'Bootstrap');
}

void bootstrap();
