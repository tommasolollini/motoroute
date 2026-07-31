import { describe, it, expect, beforeEach } from 'vitest';
import { busy, busyCount } from './busy';

/**
 * DOM finto: il modulo usa solo getElementById, textContent e hidden.
 * Meglio di aggiungere jsdom al progetto per una manciata di proprietà.
 */
interface FakeEl {
  hidden: boolean;
  textContent: string;
}

function mountDom(): { box: FakeEl; label: FakeEl } {
  const box: FakeEl = { hidden: true, textContent: '' };
  const label: FakeEl = { hidden: false, textContent: '' };
  (globalThis as unknown as { document: unknown }).document = {
    getElementById: (id: string): FakeEl | null =>
      id === 'busy' ? box : id === 'busy-label' ? label : null,
  };
  return { box, label };
}

describe('busy', () => {
  beforeEach(() => {
    mountDom();
  });

  it('mostra l\'indicatore con la scritta data', () => {
    const { box, label } = mountDom();
    const t = busy('Calcolo il percorso…');
    expect(box.hidden).toBe(false);
    expect(label.textContent).toBe('Calcolo il percorso…');
    t.done();
    expect(box.hidden).toBe(true);
  });

  it('resta acceso finché un\'altra attività è in corso', () => {
    const { box } = mountDom();
    const a = busy('primo');
    const b = busy('secondo');
    a.done();
    expect(box.hidden).toBe(false); // b è ancora in corso
    b.done();
    expect(box.hidden).toBe(true);
  });

  it('mostra sempre l\'ultima attività avviata', () => {
    const { label } = mountDom();
    const a = busy('primo');
    const b = busy('secondo');
    expect(label.textContent).toBe('secondo');
    b.done();
    expect(label.textContent).toBe('primo');
    a.done();
  });

  it('aggiorna la scritta senza chiudere l\'attività', () => {
    const { box, label } = mountDom();
    const t = busy('fase 1');
    t.update('fase 2');
    expect(label.textContent).toBe('fase 2');
    expect(box.hidden).toBe(false);
    t.done();
  });

  it('chiamare done() due volte non spegne l\'attività di un altro', () => {
    const { box } = mountDom();
    const a = busy('primo');
    const b = busy('secondo');
    b.done();
    b.done(); // ripetuto: non deve togliere anche "primo"
    expect(box.hidden).toBe(false);
    expect(busyCount()).toBe(1);
    a.done();
    expect(box.hidden).toBe(true);
  });

  it('ignora update() dopo done()', () => {
    const { label } = mountDom();
    const a = busy('primo');
    const b = busy('secondo');
    b.done();
    b.update('tardivo');
    expect(label.textContent).toBe('primo');
    a.done();
  });
});
