/**
 * Shared TypeORM decimal column presets for monetary values.
 */
export const DECIMAL_36_18_COLUMN = {
  type: 'decimal',
  precision: 36,
  scale: 18,
} as const;

export const DECIMAL_36_18_DEFAULT_0_COLUMN = {
  ...DECIMAL_36_18_COLUMN,
  default: 0,
} as const;

export const DECIMAL_36_18_DEFAULT_ZERO_STRING_COLUMN = {
  ...DECIMAL_36_18_COLUMN,
  default: '0',
} as const;

export const DECIMAL_36_18_NULLABLE_COLUMN = {
  ...DECIMAL_36_18_COLUMN,
  nullable: true,
} as const;
