import { Global, Inject, Module, OnApplicationShutdown, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CORE_DB, databaseProviders, MARKET_TS_DB } from './database.providers';

@Global()
@Module({
  providers: [...databaseProviders],
  exports: [...databaseProviders],
})
export class DatabaseProvidersModule implements OnApplicationShutdown {
  constructor(
    @Inject(CORE_DB) private readonly coreDb: DataSource,
    @Optional() @Inject(MARKET_TS_DB) private readonly marketTsDb: DataSource | null = null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.marketTsDb?.isInitialized) {
      await this.marketTsDb.destroy();
    }
    if (this.coreDb?.isInitialized) {
      await this.coreDb.destroy();
    }
  }
}
