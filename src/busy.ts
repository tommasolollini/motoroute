/**
 * Indicatore di attività condiviso.
 *
 * Serve un punto solo dove dire "sto lavorando", perché le operazioni si
 * sovrappongono: mentre l'IA cerca i luoghi parte anche il calcolo del percorso.
 * Con una pila di attività l'indicatore resta acceso finché ce n'è almeno una e
 * mostra sempre l'ultima avviata, invece di spegnersi al primo `done()`.
 *
 * Vive fuori dal pannello, così si vede anche quando il pannello è chiuso.
 */

export interface Task {
  /** Cambia la scritta senza chiudere l'attività (fasi di uno stesso lavoro). */
  update(label: string): void;
  done(): void;
}

interface Entry {
  id: number;
  label: string;
}

const stack: Entry[] = [];
let seq = 0;

function render(): void {
  const box = document.getElementById('busy');
  const label = document.getElementById('busy-label');
  if (!box || !label) return;
  const top = stack[stack.length - 1];
  if (top) {
    label.textContent = top.label;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

export function busy(label: string): Task {
  const id = ++seq;
  stack.push({ id, label });
  render();

  let closed = false;
  return {
    update(next: string): void {
      if (closed) return;
      const e = stack.find((s) => s.id === id);
      if (e) {
        e.label = next;
        render();
      }
    },
    done(): void {
      if (closed) return; // chiamare done() due volte non deve spegnere l'attività di un altro
      closed = true;
      const i = stack.findIndex((s) => s.id === id);
      if (i !== -1) stack.splice(i, 1);
      render();
    },
  };
}

/** Solo per i test / lo stato corrente. */
export function busyCount(): number {
  return stack.length;
}
