/** Local persistence of saved routes via IndexedDB (no backend, per-device). */

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: number;
  points: { lng: number; lat: number }[];
  distanceKm: number;
  durationHours: number;
  /** LineString coordinates [lon, lat(, ele)] so the route redraws without re-routing. */
  geometry: number[][];
}

const DB_NAME = 'motoroute';
const STORE = 'routes';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function saveRoute(route: SavedRoute): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(route));
}

export async function allRoutes(): Promise<SavedRoute[]> {
  const list = await tx<SavedRoute[]>('readonly', (s) => s.getAll());
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteRoute(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id));
}
