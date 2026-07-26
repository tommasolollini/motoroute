/** Saved start points ("home bases"), kept locally. One is chosen at a time,
 *  but several can be stored and each stays editable. */
export interface SavedStart {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

const KEY = 'mr_starts';

export function getStarts(): SavedStart[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedStart[];
  } catch {
    return [];
  }
}

function write(list: SavedStart[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
}

export function addStart(name: string, lng: number, lat: number): SavedStart {
  const item: SavedStart = { id: crypto.randomUUID?.() ?? String(Date.now()), name, lng, lat };
  write([item, ...getStarts()]);
  return item;
}

export function deleteStart(id: string): void {
  write(getStarts().filter((s) => s.id !== id));
}

export function renameStart(id: string, name: string): void {
  write(getStarts().map((s) => (s.id === id ? { ...s, name } : s)));
}
