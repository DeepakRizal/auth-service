export type ProductRow = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  category: string;
  createdAt: Date;
};

export type ProductSortBy = 'createdAt' | 'price' | 'name';
export type SortOrder = 'asc' | 'desc';

export type ProductListQuery = {
  limit: number;
  sortBy: ProductSortBy;
  sortOrder: SortOrder;
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  createdFrom?: Date;
  createdTo?: Date;
  cursor?: {
    v: string | number;
    id: number;
  };
};
