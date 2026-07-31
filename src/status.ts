/**
 * Avvisi di disservizio.
 *
 * Niente cruscotto dei servizi: richiederebbe sondaggi continui, aggiungerebbe
 * traffico verso il proxy e darebbe false certezze (un servizio può rispondere
 * al controllo e fallire sulla richiesta vera). Si dice all'utente ciò che si
 * sa per certo, quando lo si sa: che manca la connessione, o quale pezzo
 * preciso non ha risposto e cosa continua a funzionare.
 */

export type NoticeKind = 'offline' | 'degraded';

let hideTimer: number | undefined;

function el(): { box: HTMLElement; text: HTMLElement } | null {
  const box = document.getElementById('notice');
  const text = document.getElementById('notice-text');
  return box && text ? { box, text } : null;
}

export function showNotice(message: string, kind: NoticeKind, autoHideMs = 0): void {
  const e = el();
  if (!e) return;
  window.clearTimeout(hideTimer);
  e.text.textContent = message;
  e.box.dataset.kind = kind;
  e.box.hidden = false;
  if (autoHideMs > 0) hideTimer = window.setTimeout(hideNotice, autoHideMs);
}

export function hideNotice(): void {
  const e = el();
  if (!e) return;
  window.clearTimeout(hideTimer);
  e.box.hidden = true;
}

const OFFLINE_MSG =
  'Sei offline. La mappa già caricata resta visibile, ma percorsi, IA e meteo non sono raggiungibili.';

/**
 * `navigator.onLine` è affidabile solo quando dice "offline": molti sistemi
 * riportano "online" anche agganciati a una rete che non porta da nessuna parte.
 * Per questo si usa per l'avviso ma non per bloccare nulla.
 */
export function watchConnection(): void {
  const sync = (): void => {
    if (navigator.onLine) hideNotice();
    else showNotice(OFFLINE_MSG, 'offline');
  };
  window.addEventListener('offline', sync);
  window.addEventListener('online', sync);
  sync();
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Messaggio d'errore che dice QUALE servizio non ha risposto e cosa resta
 * utilizzabile, invece di un generico "non disponibile".
 */
export function serviceMessage(service: string, stillWorks?: string): string {
  if (isOffline()) return OFFLINE_MSG;
  const base = `${service} non risponde in questo momento.`;
  return stillWorks ? `${base} ${stillWorks}` : base;
}
