import { Injectable, Logger } from '@nestjs/common';
import type {
  DataSource,
  DeepPartial,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import type { IRepository } from './interfaces/irepository.interface';

/**
 * Base Repository
 * Repository Pattern: Data access abstraction
 * Template Method Pattern: Base operations template
 * Generic Programming: Type-safe repositories
 */
@Injectable()
export abstract class BaseRepository<T extends ObjectLiteral> implements IRepository<T> {
  protected readonly logger: Logger;
  protected _repository: Repository<T> | null = null;
  protected readonly dataSource: DataSource;

  constructor(
    protected readonly entity: EntityTarget<T>,
    dataSource: DataSource,
  ) {
    this.dataSource = dataSource;
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Get repository with lazy initialization
   * This ensures the repository is only initialized when actually needed,
   * after TypeORM has fully initialized the DataSource with all entities
   */
  protected get repository(): Repository<T> {
    if (!this._repository) {
      this._repository = this.dataSource.getRepository(this.entity);
    }
    return this._repository;
  }

  /**
   * Get primary key property name from entity metadata
   * Returns the first primary column property name
   */
  protected getPrimaryKeyName(): string {
    const metadata = this.dataSource.getMetadata(this.entity);
    const primaryColumns = metadata.primaryColumns;
    if (primaryColumns.length === 0) {
      throw new Error(`Entity ${metadata.name} has no primary key`);
    }
    // Return the first primary column property name
    return primaryColumns[0].propertyName;
  }

  /**
   * Find entity by ID
   * Template Method: Base implementation
   * Automatically uses the correct primary key field name
   */
  async findById(id: number | string): Promise<T | null> {
    try {
      const primaryKeyName = this.getPrimaryKeyName();
      const whereClause = { [primaryKeyName]: id } as unknown as FindOptionsWhere<T>;
      return await this.repository.findOne({
        where: whereClause,
      } as FindOneOptions<T>);
    } catch (error) {
      this.logger.error(`Error finding ${this.entity.toString()} by ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Find one entity by options
   */
  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    try {
      return await this.repository.findOne(options);
    } catch (error) {
      this.logger.error(`Error finding one ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Find entities by options
   */
  async find(options?: FindManyOptions<T>): Promise<T[]> {
    try {
      return await this.repository.find(options);
    } catch (error) {
      this.logger.error(`Error finding ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Find entities with pagination
   * Template Method: Pagination logic
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: FindManyOptions<T>,
  ): Promise<{ data: T[]; total: number; page: number; limit: number }> {
    try {
      const skip = (page - 1) * limit;
      const take = limit;

      const [data, total] = await this.repository.findAndCount({
        ...options,
        skip,
        take,
      });

      return {
        data,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(`Error finding ${this.entity.toString()} with pagination`, error);
      throw error;
    }
  }

  /**
   * Count entities
   */
  async count(options?: FindManyOptions<T>): Promise<number> {
    try {
      return await this.repository.count(options);
    } catch (error) {
      this.logger.error(`Error counting ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Check if entity exists
   */
  async exists(options: FindOptionsWhere<T>): Promise<boolean> {
    try {
      const count = await this.repository.count({ where: options });
      return count > 0;
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Create new entity
   * Template Method: Base create implementation
   */
  async create(entity: DeepPartial<T>): Promise<T> {
    try {
      const newEntity = this.repository.create(entity);
      return await this.repository.save(newEntity);
    } catch (error) {
      this.logger.error(`Error creating ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Create multiple entities
   */
  async createMany(entities: DeepPartial<T>[]): Promise<T[]> {
    try {
      const newEntities = this.repository.create(entities);
      return await this.repository.save(newEntities);
    } catch (error) {
      this.logger.error(`Error creating multiple ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Update entity by ID
   * Template Method: Base update implementation
   * Automatically uses the correct primary key field name
   */
  async update(id: number | string, entity: DeepPartial<T>): Promise<T> {
    try {
      const primaryKeyName = this.getPrimaryKeyName();
      const whereClause = { [primaryKeyName]: id } as any;
      await this.repository.update(whereClause, entity as any);
      const updated = await this.findById(id);
      if (!updated) {
        throw new Error(`Entity with ID ${id} not found after update`);
      }
      return updated;
    } catch (error) {
      this.logger.error(`Error updating ${this.entity.toString()} with ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Update entities by criteria
   */
  async updateMany(criteria: FindOptionsWhere<T>, entity: DeepPartial<T>): Promise<number> {
    try {
      const result = await this.repository.update(criteria, entity as any);
      return result.affected || 0;
    } catch (error) {
      this.logger.error(`Error updating multiple ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Delete entity by ID (soft delete if entity has deletedAt)
   * Template Method: Can be overridden for soft delete
   * Automatically uses the correct primary key field name
   */
  async delete(id: number | string): Promise<void> {
    try {
      const primaryKeyName = this.getPrimaryKeyName();
      const whereClause = { [primaryKeyName]: id } as any;
      const result = await this.repository.delete(whereClause);
      if (result.affected === 0) {
        throw new Error(`Entity with ID ${id} not found`);
      }
    } catch (error) {
      this.logger.error(`Error deleting ${this.entity.toString()} with ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Delete entities by criteria
   */
  async deleteMany(criteria: FindOptionsWhere<T>): Promise<number> {
    try {
      const result = await this.repository.delete(criteria);
      return result.affected || 0;
    } catch (error) {
      this.logger.error(`Error deleting multiple ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Hard delete entity by ID
   * Automatically uses the correct primary key field name
   */
  async hardDelete(id: number | string): Promise<void> {
    try {
      const primaryKeyName = this.getPrimaryKeyName();
      const whereClause = { [primaryKeyName]: id } as any;
      const result = await this.repository.delete(whereClause);
      if (result.affected === 0) {
        throw new Error(`Entity with ID ${id} not found`);
      }
    } catch (error) {
      this.logger.error(`Error hard deleting ${this.entity.toString()} with ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Save entity (create or update)
   */
  async save(entity: DeepPartial<T>): Promise<T> {
    try {
      return await this.repository.save(entity);
    } catch (error) {
      this.logger.error(`Error saving ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Save multiple entities
   */
  async saveMany(entities: DeepPartial<T>[]): Promise<T[]> {
    try {
      return await this.repository.save(entities);
    } catch (error) {
      this.logger.error(`Error saving multiple ${this.entity.toString()}`, error);
      throw error;
    }
  }

  /**
   * Get TypeORM Repository instance
   * Useful for complex queries
   */
  getRepository(): Repository<T> {
    return this.repository;
  }

  /**
   * Get DataSource instance
   * Useful for raw queries and transactions
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Execute raw query
   * Useful for stored procedures or complex queries
   */
  async query(sql: string, parameters?: any[]): Promise<any> {
    try {
      return await this.dataSource.query(sql, parameters);
    } catch (error) {
      this.logger.error(`Error executing query: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute transaction
   * Template Method: Transaction wrapper
   */
  async transaction<R>(fn: (manager: any) => Promise<R>): Promise<R> {
    try {
      return await this.dataSource.transaction(fn);
    } catch (error) {
      this.logger.error(`Error in transaction`, error);
      throw error;
    }
  }
}
