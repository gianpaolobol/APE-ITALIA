import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './http-setup';

async function bootstrap() {
 const app = await NestFactory.create(AppModule);
 configureHttp(app);
 app.enableShutdownHooks();
 await app.listen(process.env.PORT || 3001);
}
bootstrap();
