import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedAiHelpDocsUseCase } from '../modules/ai-assistant/application/use-cases/seed-ai-help-docs.use-case';

async function main(): Promise<void> {
  const logger = new Logger('SeedAiHelpDocs');
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  try {
    const useCase = app.get(SeedAiHelpDocsUseCase);
    const result = await useCase.execute(force);
    logger.log(`Done: ${JSON.stringify(result)}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-ai-help-docs] failed:', err);
  process.exit(1);
});
