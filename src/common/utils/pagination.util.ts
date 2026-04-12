export interface PaginationInput {
  page?: number;
  limit?: number;
}

export function calcSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
