import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, listSessions } from './db';

vi.mock('dexie', () => ({
  default: class {
    sessions = {
      toCollection: () => ({
        reverse() { return this; },
        sortBy: vi.fn(),
        toArray: vi.fn(),
      }),
      where: vi.fn(),
      orderBy: vi.fn(),
    };
    version() { return { stores: vi.fn() }; }
  },
}));

afterEach(() => vi.restoreAllMocks());

describe('session history queries', () => {
  it('scopes presentation history by ID and sorts newest first', async () => {
    const collection = db.sessions.toCollection();
    const where = vi.spyOn(db.sessions, 'where').mockReturnValue(collection);
    const reverse = vi.spyOn(collection, 'reverse');
    const sortBy = vi.spyOn(collection, 'sortBy').mockResolvedValue([]);

    expect(await listSessions('p1')).toEqual([]);
    expect(where).toHaveBeenCalledWith({ presentationId: 'p1' });
    expect(reverse).toHaveBeenCalledOnce();
    expect(sortBy).toHaveBeenCalledWith('timestamp');
  });

  it('keeps global history ordered by timestamp without a presentation filter', async () => {
    const collection = db.sessions.toCollection();
    const where = vi.spyOn(db.sessions, 'where');
    const orderBy = vi.spyOn(db.sessions, 'orderBy').mockReturnValue(collection);
    const reverse = vi.spyOn(collection, 'reverse');
    vi.spyOn(collection, 'toArray').mockResolvedValue([]);

    expect(await listSessions()).toEqual([]);
    expect(where).not.toHaveBeenCalled();
    expect(orderBy).toHaveBeenCalledWith('timestamp');
    expect(reverse).toHaveBeenCalledOnce();
  });
});
