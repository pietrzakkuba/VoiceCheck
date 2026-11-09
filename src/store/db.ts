import Dexie, { type EntityTable } from 'dexie';
import type { TrainingSession, UserBaseline } from '@/types';

export interface AudioRecord {
  key: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

export interface BaselineRecord extends UserBaseline {
  id: 'current';
}

export const db = new Dexie('clearvoice') as Dexie & {
  sessions: EntityTable<TrainingSession, 'id'>;
  audio: EntityTable<AudioRecord, 'key'>;
  baseline: EntityTable<BaselineRecord, 'id'>;
};

db.version(1).stores({
  sessions: 'id, timestamp, mode, conversationId, analysisStatus',
  audio: 'key, createdAt',
  baseline: 'id',
});

// v2: tempo & breath only. Old sessions are re-analysed by migrateLegacySessions().
db.version(2).stores({
  sessions: 'id, timestamp, mode, schema',
});

export async function getBaseline(): Promise<UserBaseline | null> {
  return (await db.baseline.get('current')) ?? null;
}

export async function saveBaseline(b: UserBaseline) {
  await db.baseline.put({ ...b, id: 'current' });
}

export async function saveSession(session: TrainingSession, audio?: Blob) {
  await db.transaction('rw', db.sessions, db.audio, async () => {
    if (audio) {
      await db.audio.put({ key: session.audioKey, blob: audio, mimeType: audio.type, createdAt: Date.now() });
    }
    await db.sessions.put(session);
  });
}

/** Current-schema sessions, newest first. */
export async function listSessions(): Promise<TrainingSession[]> {
  const all = await db.sessions.orderBy('timestamp').reverse().toArray();
  return all.filter((s) => s.schema === 2);
}

export async function deleteSession(id: string) {
  const s = await db.sessions.get(id);
  await db.transaction('rw', db.sessions, db.audio, async () => {
    await db.sessions.delete(id);
    if (s) await db.audio.delete(s.audioKey);
  });
}

export async function clearAllData() {
  await db.transaction('rw', db.sessions, db.audio, db.baseline, async () => {
    await db.sessions.clear();
    await db.audio.clear();
    await db.baseline.clear();
  });
}
