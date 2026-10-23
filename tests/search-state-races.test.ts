import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../src/core/network/http';
import type { Product } from '../src/features/menu/models';

const repository = vi.hoisted(() => ({ search: vi.fn(), suggest: vi.fn(), listTrending: vi.fn() }));
vi.mock('../src/features/menu/repositories/MenuRepository', () => ({ menuRepository: repository }));
import { useSearchStore } from '../src/features/menu/state/searchStore';

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const response = (id: string) => ok({ items: [{ id, name: id } as Product] });

beforeEach(() => { vi.resetAllMocks(); useSearchStore.getState().reset(); });

describe('search intent and stale response guards', () => {
  it('submits one repository call when Enter and debounce request the same intent', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValue(pending.promise);
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const first = store.submit('branch_a');
    await store.submit('branch_a');
    expect(repository.search).toHaveBeenCalledTimes(1);
    pending.resolve(response('burger'));
    await first;
  });

  it('does not resurrect results after the customer clears the query', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValue(pending.promise);
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const request = store.submit('branch_a');
    store.setQuery('');
    pending.resolve(response('stale'));
    await request;
    expect(useSearchStore.getState()).toMatchObject({ query: '', results: [], status: 'idle' });
  });

  it('discards the old response as soon as the query changes, before debounce submits', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValue(pending.promise);
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const request = store.submit('branch_a');
    store.setQuery('fries');
    pending.resolve(response('burger'));
    await request;
    expect(useSearchStore.getState().results).toEqual([]);
  });

  it('propagates the selected kind and keeps the newest results', async () => {
    const first = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response('combo'));
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const old = store.submit('branch_a');
    store.setKind('combo');
    await store.submit('branch_a');
    first.resolve(response('old_product'));
    await old;
    expect(repository.search).toHaveBeenLastCalledWith('branch_a', 'burger', { kind: 'combo' });
    expect(useSearchStore.getState().results[0].id).toBe('combo');
  });

  it('permits resubmission after changing away from and back to an in-flight term', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response('fresh'));
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const obsolete = store.submit('branch_a');
    store.setQuery('fries');
    store.setQuery('burger');
    await store.submit('branch_a');
    pending.resolve(response('obsolete'));
    await obsolete;
    expect(repository.search).toHaveBeenCalledTimes(2);
    expect(useSearchStore.getState().results[0].id).toBe('fresh');
  });

  it('reset invalidates the outstanding search rather than restoring the old screen', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    repository.search.mockReturnValue(pending.promise);
    useSearchStore.getState().setQuery('burger');
    const request = useSearchStore.getState().submit('branch_a');
    useSearchStore.getState().reset();
    pending.resolve(response('stale'));
    await request;
    expect(useSearchStore.getState()).toMatchObject({ query: '', results: [], status: 'idle' });
  });

  it('does not restore old suggestions after clearing, and handles rejected suggestions', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    repository.suggest.mockReturnValueOnce(pending.promise);
    const store = useSearchStore.getState();
    store.setQuery('burger');
    const request = store.fetchSuggestions('branch_a');
    store.setQuery('');
    pending.resolve(ok([{ id: 'stale', label: 'burger' }]));
    await request;
    expect(useSearchStore.getState().suggestions).toEqual([]);
    store.setQuery('fries');
    repository.suggest.mockRejectedValueOnce(new Error('fixture offline'));
    await expect(store.fetchSuggestions('branch_a')).resolves.toBeUndefined();
  });

  it('keeps the new store trending chips when the previous store resolves last', async () => {
    const oldTrending = deferred<ReturnType<typeof ok>>();
    repository.listTrending
      .mockReturnValueOnce(oldTrending.promise)
      .mockResolvedValueOnce(ok([{ id: 'new_store_chip', label: 'New store chip' }]));
    const store = useSearchStore.getState();

    const switchedAway = store.fetchTrending('branch_a');
    await store.fetchTrending('branch_b');
    oldTrending.resolve(ok([{ id: 'old_store_chip', label: 'Old store chip' }]));
    await switchedAway;

    expect(useSearchStore.getState().trending.map((item) => item.id)).toEqual(['new_store_chip']);
  });

  it('drops a previous store suggestion response that lands after the store switch', async () => {
    const oldSuggestions = deferred<ReturnType<typeof ok>>();
    repository.suggest
      .mockReturnValueOnce(oldSuggestions.promise)
      .mockResolvedValueOnce(ok([{ id: 'new_store_suggestion', label: 'New store suggestion' }]));
    const store = useSearchStore.getState();
    store.setQuery('burger');

    const switchedAway = store.fetchSuggestions('branch_a');
    await store.fetchSuggestions('branch_b');
    oldSuggestions.resolve(ok([{ id: 'old_store_suggestion', label: 'Old store suggestion' }]));
    await switchedAway;

    expect(useSearchStore.getState().suggestions.map((item) => item.id)).toEqual([
      'new_store_suggestion',
    ]);
  });
});
