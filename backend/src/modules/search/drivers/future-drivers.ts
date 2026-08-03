import { Injectable, NotImplementedException } from '@nestjs/common';
import type { SearchQueryDto } from '../dto';
import type { ISearchDriver, SearchDriverResult } from './search-driver.interface';

/** Placeholder — implemented in a future phase without any HTTP contract change. */
@Injectable()
export class MeilisearchDriver implements ISearchDriver {
  readonly name = 'meilisearch';
  search(_input: SearchQueryDto): Promise<SearchDriverResult> {
    throw new NotImplementedException();
  }
  autocomplete(_prefix: string, _limit: number): Promise<string[]> {
    throw new NotImplementedException();
  }
  index(_entityType: 'product' | 'category' | 'offer' | 'store', _id: string): Promise<void> {
    throw new NotImplementedException();
  }
  rebuild(): Promise<void> {
    throw new NotImplementedException();
  }
}

@Injectable()
export class TypesenseDriver implements ISearchDriver {
  readonly name = 'typesense';
  search(_input: SearchQueryDto): Promise<SearchDriverResult> {
    throw new NotImplementedException();
  }
  autocomplete(_prefix: string, _limit: number): Promise<string[]> {
    throw new NotImplementedException();
  }
  index(_entityType: 'product' | 'category' | 'offer' | 'store', _id: string): Promise<void> {
    throw new NotImplementedException();
  }
  rebuild(): Promise<void> {
    throw new NotImplementedException();
  }
}

@Injectable()
export class ElasticsearchDriver implements ISearchDriver {
  readonly name = 'elasticsearch';
  search(_input: SearchQueryDto): Promise<SearchDriverResult> {
    throw new NotImplementedException();
  }
  autocomplete(_prefix: string, _limit: number): Promise<string[]> {
    throw new NotImplementedException();
  }
  index(_entityType: 'product' | 'category' | 'offer' | 'store', _id: string): Promise<void> {
    throw new NotImplementedException();
  }
  rebuild(): Promise<void> {
    throw new NotImplementedException();
  }
}
