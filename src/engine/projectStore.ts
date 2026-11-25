import type { ProjectVersion, StudioProject } from './types';

const DB_NAME = 'koma-animation-studio-db';
const DB_VERSION = 1;
const STORE_AUTOSAVE = 'autosave';
const STORE_VERSIONS = 'versions';
const AUTOSAVE_KEY = 'latest-project';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
        db.createObjectStore(STORE_AUTOSAVE);
      }
      if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
        db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosaveProject(project: StudioProject): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_AUTOSAVE, 'readwrite');
      const store = tx.objectStore(STORE_AUTOSAVE);
      store.put(
        {
          project,
          savedAt: new Date().toISOString(),
        },
        AUTOSAVE_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage for environments with restricted IndexedDB
    try {
      localStorage.setItem('koma_autosave_fallback', JSON.stringify(project));
    } catch {
      // Ignore quota exceeded
    }
  }
}

export async function loadAutosaveProject(): Promise<{
  project: StudioProject;
  savedAt: string;
} | null> {
  try {
    const db = await openDb();
    const res = await new Promise<{ project: StudioProject; savedAt: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_AUTOSAVE, 'readonly');
        const store = tx.objectStore(STORE_AUTOSAVE);
        const req = store.get(AUTOSAVE_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    );
    if (res && res.project && res.project.formatVersion === '1.0') {
      return res;
    }
  } catch {
    // Fallback check
  }

  try {
    const raw = localStorage.getItem('koma_autosave_fallback');
    if (raw) {
      const parsed = JSON.parse(raw) as StudioProject;
      if (parsed && parsed.formatVersion === '1.0') {
        return { project: parsed, savedAt: parsed.updatedAt };
      }
    }
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

export async function saveVersionSnapshot(
  project: StudioProject,
  label: string
): Promise<ProjectVersion> {
  const version: ProjectVersion = {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectId: project.id,
    label,
    savedAt: new Date().toISOString(),
    snapshot: JSON.parse(JSON.stringify(project)) as StudioProject,
  };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VERSIONS, 'readwrite');
      tx.objectStore(STORE_VERSIONS).put(version);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best effort
  }
  return version;
}

export async function listProjectVersions(): Promise<ProjectVersion[]> {
  try {
    const db = await openDb();
    return await new Promise<ProjectVersion[]>((resolve, reject) => {
      const tx = db.transaction(STORE_VERSIONS, 'readonly');
      const req = tx.objectStore(STORE_VERSIONS).getAll();
      req.onsuccess = () => {
        const items = (req.result as ProjectVersion[]) ?? [];
        items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(items.slice(0, 20));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export function serializeProjectFile(project: StudioProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProjectFile(jsonText: string): StudioProject {
  const parsed = JSON.parse(jsonText) as StudioProject;
  if (
    !parsed ||
    parsed.formatVersion !== '1.0' ||
    !Array.isArray(parsed.scenes) ||
    parsed.scenes.length === 0
  ) {
    throw new Error('Invalid Koma Studio project file (.koma.json)');
  }
  return parsed;
}
