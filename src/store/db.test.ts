import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, deleteSession, deleteSessions, listSessions } from './db';

vi.mock('dexie', () => ({
  default: class {
    sessions = {
      get: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      bulkDelete: vi.fn(),
      toCollection: () => ({
        reverse() { return this; },
        sortBy: vi.fn(),
        toArray: vi.fn(),
      }),
      where: vi.fn(),
      orderBy: vi.fn(),
    };
    audio = { delete: vi.fn(), clear: vi.fn(), bulkDelete: vi.fn() };
    transaction = vi.fn(async (_mode, _sessions, _audio, action: () => Promise<void>) => action());
    version() { return { stores: () => ({ upgrade: vi.fn() }) }; }
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

  describe('session deletion', () => {
    it('clears all sessions and recordings in one transaction without touching presentations or baseline', async () => {
      const clearSessions = vi.spyOn(db.sessions, 'clear').mockResolvedValue(undefined);
      const clearAudio = vi.spyOn(db.audio, 'clear').mockResolvedValue(undefined);
      const where = vi.spyOn(db.sessions, 'where');
      await deleteSessions();
      expect(db.transaction).toHaveBeenCalledWith('rw', db.sessions, db.audio, expect.any(Function));
      expect(clearSessions).toHaveBeenCalledOnce();
      expect(clearAudio).toHaveBeenCalledOnce();
      expect(where).not.toHaveBeenCalled();
    });

    it.each([{ presentationId: 'p1' }, { mode: 'free_speech' } as const])('deletes every matching session and recording without a schema or page filter: %j', async (scope) => {
      const collection = db.sessions.toCollection();
      const where = vi.spyOn(db.sessions, 'where').mockReturnValue(collection);
      vi.spyOn(collection, 'toArray').mockResolvedValue([
        { id: 's1', audioKey: 'audio-s1', schema: 2 },
        { id: 'legacy', audioKey: 'audio-legacy', schema: 1 },
      ] as Awaited<ReturnType<typeof collection.toArray>>);
      const removeSessions = vi.spyOn(db.sessions, 'bulkDelete').mockResolvedValue(undefined);
      const removeAudio = vi.spyOn(db.audio, 'bulkDelete').mockResolvedValue(undefined);
      const clearSessions = vi.spyOn(db.sessions, 'clear');
      const clearAudio = vi.spyOn(db.audio, 'clear');
      await deleteSessions(scope);
      expect(db.transaction).toHaveBeenCalledWith('rw', db.sessions, db.audio, expect.any(Function));
      expect(where).toHaveBeenCalledExactlyOnceWith(scope);
      expect(removeSessions).toHaveBeenCalledExactlyOnceWith(['s1', 'legacy']);
      expect(removeAudio).toHaveBeenCalledExactlyOnceWith(['audio-s1', 'audio-legacy']);
      expect(clearSessions).not.toHaveBeenCalled();
      expect(clearAudio).not.toHaveBeenCalled();
    });

    it('propagates bulk deletion errors', async () => {
      vi.spyOn(db.sessions, 'clear').mockRejectedValue(new Error('Storage unavailable'));
      await expect(deleteSessions()).rejects.toThrow('Storage unavailable');
    });

    it('deletes the session and its audio in one transaction without touching other data', async () => {
      vi.spyOn(db.sessions, 'get').mockResolvedValue({ audioKey: 'audio-s1' } as Awaited<ReturnType<typeof db.sessions.get>>);
      const removeSession = vi.spyOn(db.sessions, 'delete').mockResolvedValue(undefined);
      const removeAudio = vi.spyOn(db.audio, 'delete').mockResolvedValue(undefined);
      await deleteSession('s1');
      expect(db.transaction).toHaveBeenCalledWith('rw', db.sessions, db.audio, expect.any(Function));
      expect(removeSession).toHaveBeenCalledExactlyOnceWith('s1');
      expect(removeAudio).toHaveBeenCalledExactlyOnceWith('audio-s1');
    });

    it('handles a session already removed by another view', async () => {
      vi.spyOn(db.sessions, 'get').mockResolvedValue(undefined);
      const removeSession = vi.spyOn(db.sessions, 'delete').mockResolvedValue(undefined);
      const removeAudio = vi.spyOn(db.audio, 'delete').mockResolvedValue(undefined);
      await deleteSession('missing');
      expect(removeSession).toHaveBeenCalledWith('missing');
      expect(removeAudio).not.toHaveBeenCalled();
    });

    it('propagates storage errors to the confirmation dialog', async () => {
      vi.spyOn(db.sessions, 'get').mockResolvedValue({ audioKey: 'audio-s1' } as Awaited<ReturnType<typeof db.sessions.get>>);
      vi.spyOn(db.sessions, 'delete').mockRejectedValue(new Error('Storage unavailable'));
      await expect(deleteSession('s1')).rejects.toThrow('Storage unavailable');
    });
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
