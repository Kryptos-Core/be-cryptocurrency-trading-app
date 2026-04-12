import type { DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere } from 'typeorm';

/**
 * IRepository Interface
 * Interface Segregation Principle: Define contract for repository operations
 * Generic Programming: Type-safe repository interface
 */
export interface IRepository<T> {
  /**
   * Find entity by ID
   */
  findById(id: number | string): Promise<T | null>;

  /**
   * Find one entity by options
   */
  findOne(options: FindOneOptions<T>): Promise<T | null>;

  /**
   * Find entities by options
   */
  find(options?: FindManyOptions<T>): Promise<T[]>;

  /**
   * Find entities with pagination
   */
  findWithPagination(
    page: number,
    limit: number,
    options?: FindManyOptions<T>,
  ): Promise<{ data: T[]; total: number; page: number; limit: number }>;

  /**
   * Count entities
   */
  count(options?: FindManyOptions<T>): Promise<number>;

  /**
   * Check if entity exists
   */
  exists(options: FindOptionsWhere<T>): Promise<boolean>;

  /**
   * Create new entity
   */
  create(entity: DeepPartial<T>): Promise<T>;

  /**
   * Create multiple entities
   */
  createMany(entities: DeepPartial<T>[]): Promise<T[]>;

  /**
   * Update entity by ID
   */
  update(id: number | string, entity: DeepPartial<T>): Promise<T>;

  /**
   * Update entities by criteria
   */
  updateMany(criteria: FindOptionsWhere<T>, entity: DeepPartial<T>): Promise<number>;

  /**
   * Delete entity by ID
   */
  delete(id: number | string): Promise<void>;

  /**
   * Delete entities by criteria
   */
  deleteMany(criteria: FindOptionsWhere<T>): Promise<number>;

  /**
   * Save entity (create or update)
   */
  save(entity: DeepPartial<T>): Promise<T>;

  /**
   * Save multiple entities
   */
  saveMany(entities: DeepPartial<T>[]): Promise<T[]>;
}
