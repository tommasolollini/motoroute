# MotoRoute — pubblicazione & automazione multi-dispositivo

Obiettivo: la chiave sta **in un solo posto** (il Worker). Ogni dispositivo — iPhone
incluso — apre la PWA e funziona **senza chiave e senza configurazione**.

Devi farlo **una volta sola**. I passi con 👤 richiedono te (creazione account/login):
non posso registrarmi o autenticarmi al posto tuo. Tutto il resto è già pronto nel codice.

## 1. Chiave OpenRouteService (gratis, no carta)
1. 👤 Registrati su https://openrouteservice.org/dev/#/signup
2. 👤 Dashboard → **Create Token** (tipo *Standard*) → copia la chiave.

## 2. Worker Cloudflare (custodisce la chiave)
1. 👤 Crea un account gratuito su https://dash.cloudflare.com/sign-up
2. Installa le dipendenze (una volta): `npm install`
3. 👤 Login: `npx wrangler login` (si apre il browser, autorizzi tu)
4. Salva la chiave come segreto: `npx wrangler secret put ORS_API_KEY`
   → incolla la chiave del passo 1 quando richiesto.
5. Pubblica il Worker: `npm run worker:deploy`
   → copia l'URL che ti restituisce (es. `https://motoroute-proxy.<tuo>.workers.dev`).
6. Verifica: apri `<URL>/health` → deve rispondere `{"ok":true,"hasKey":true}`.

## 3. Collega l'app al Worker
1. In `.env` imposta: `VITE_WORKER_URL=<URL del Worker>` (lascia `VITE_ORS_API_KEY` vuoto).
2. Da questo momento l'app usa il Worker: nessun dispositivo ha più bisogno della chiave.

## 4. Pubblica la PWA (Cloudflare Pages, gratis)
1. `npm run build` → genera `dist/`.
2. 👤 Cloudflare Dash → Pages → collega il repo GitHub (build command `npm run build`,
   output `dist`), e imposta la variabile d'ambiente `VITE_WORKER_URL`.
3. Sull'iPhone: apri l'URL in Safari → **Condividi → Aggiungi a Home**. Fatto.

## Sicurezza (consigliato dopo il deploy)
- Blocca il Worker alla tua origine: in `wrangler.toml` imposta
  `[vars] ALLOWED_ORIGINS = "https://<tuo-sito>.pages.dev"` e ri-deploya.
- La chiave non è mai nel repo né sui dispositivi: vive solo nei *secrets* del Worker.
