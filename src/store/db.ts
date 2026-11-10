import Dexie, { type EntityTable } from 'dexie';
import type { Presentation, TrainingSession, UserBaseline } from '@/types';

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
  presentations: EntityTable<Presentation, 'id'>;
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

// v3: presentation library; sessions can reference the presentation they rehearse.
db.version(3).stores({
  sessions: 'id, timestamp, mode, schema, presentationId',
  presentations: 'id, updatedAt',
});

/** Presentations, most recently edited first. */
export async function listPresentations(): Promise<Presentation[]> {
  return db.presentations.orderBy('updatedAt').reverse().toArray();
}

export async function getPresentation(id: string): Promise<Presentation | null> {
  return (await db.presentations.get(id)) ?? null;
}

export async function savePresentation(p: Presentation) {
  await db.presentations.put(p);
}

/** Deletes the presentation only; its rehearsal sessions stay in the history (they keep their own text copy). */
export async function deletePresentation(id: string) {
  await db.presentations.delete(id);
}

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

/** Current-schema sessions, newest first, optionally scoped to one presentation. */
export async function listSessions(presentationId?: string): Promise<TrainingSession[]> {
  const all = presentationId === undefined
    ? await db.sessions.orderBy('timestamp').reverse().toArray()
    : await db.sessions.where({ presentationId }).reverse().sortBy('timestamp');
  return all.filter((s) => s.schema === 2);
}

export async function deleteSession(id: string) {
  const s = await db.sessions.get(id);
  await db.transaction('rw', db.sessions, db.audio, async () => {
    await db.sessions.delete(id);
    if (s) await db.audio.delete(s.audioKey);
  });
}

/** Deletes all sessions and recordings, or only those belonging to one presentation. */
export async function deleteSessions(presentationId?: string) {
  await db.transaction('rw', db.sessions, db.audio, async () => {
    if (presentationId === undefined) {
      await db.sessions.clear();
      await db.audio.clear();
    } else {
      const sessions = await db.sessions.where({ presentationId }).toArray();
      await db.sessions.bulkDelete(sessions.map((s) => s.id));
      await db.audio.bulkDelete(sessions.map((s) => s.audioKey));
    }
  });
}

export async function clearAllData() {
  await db.transaction('rw', [db.sessions, db.audio, db.baseline, db.presentations], async () => {
    await db.sessions.clear();
    await db.audio.clear();
    await db.baseline.clear();
    await db.presentations.clear();
  });
}
