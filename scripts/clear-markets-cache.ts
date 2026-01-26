/**
 * Script to clear markets cache in Redis
 * Run: npx ts-node -r tsconfig-paths/register scripts/clear-markets-cache.ts
 */

import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CacheService } from '../src/common/services';

async function clearMarketsCache() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const cacheService = app.get(CacheService);

  try {
    console.log('Clearing markets cache...');
    
    // Invalidate all markets cache
    await cacheService.invalidatePattern('markets:*');
    
    console.log('Markets cache cleared successfully!');
    console.log('You can now test the API - it will fetch fresh data from database');
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

clearMarketsCache();
