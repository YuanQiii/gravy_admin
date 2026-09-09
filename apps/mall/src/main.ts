import { NestFactory } from '@nestjs/core';
import { MallAppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { configureApp } from '@gvray/core';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(MallAppModule, {
    logger: isProd
      ? ['warn', 'error']
      : ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  // 共享引导接缝：pino 接管日志 + CORS + 全局管道（EmptyStringTransform → ValidationPipe）
  configureApp(app);

  const configService = app.get(ConfigService);

  // Swagger 配置
  const config = new DocumentBuilder()
    .setTitle('GVRAY Mall API')
    .setDescription('GVRAY B2C 商城公开接口（匿名浏览 + 客户自助）')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '输入 Bearer JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      defaultModelExpandDepth: 2,
      defaultModelsExpandDepth: 1,
    },
    customSiteTitle: 'GVRAY Mall API 文档',
  });

  // 启动应用
  const port = configService.get<number>('app.port')!;
  await app.listen(port);
  Logger.log(`🚀 应用启动成功: http://localhost:${port}`);
  Logger.log(`📚 API 文档地址: http://localhost:${port}/api`);
}

bootstrap();