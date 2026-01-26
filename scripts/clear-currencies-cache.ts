/**
 * Script to clear currencies cache in Redis
 * Run: npx ts-node -r tsconfig-paths/register scripts/clear-currencies-cache.ts
 */

import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CacheService } from '../src/common/services';

async function clearCurrenciesCache() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cacheService = app.get(CacheService);

  try {
    console.log('Clearing currencies cache...');
    
    // Invalidate all currencies cache
    await cacheService.invalidatePattern('currencies:*');
    
    console.log('Currencies cache cleared successfully!');
    console.log('You can now test the API - it will fetch fresh data from database');
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

clearCurrenciesCache();