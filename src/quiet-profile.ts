/**
 * "Strade tranquille" routing via a custom BRouter profile (keyless).
 * ORS's avoid_features only skips real motorways, not Italian superstrade
 * (trunk roads like the E45). These car-legal profiles penalise motorway/trunk
 * and prefer smaller roads, so the route avoids the fast dual-carriageways
 * where a smaller road exists.
 *
 * Le tre varianti sono il controllo di curvosità. I costfactor e i turncost
 * qui sotto sono quelli misurati sul campo: su cinque percorsi di prova
 * "tortuoso" è risultato più curvo di "diretto" in tutti e cinque i casi
 * (in media +52% di gradi di curva per km).
 *
 * brouter.de accepts an uploaded profile and returns a (possibly ephemeral)
 * profile id, so we re-upload once per session and cache the id per level.
 */

export type Curviness = 'diretto' | 'equilibrato' | 'tortuoso';

export const CURVINESS_LEVELS: Curviness[] = ['diretto', 'equilibrato', 'tortuoso'];

const HEAD = `---context:global
assign turnInstructionMode = 0
---context:way
assign caraccess = switch access=no|private false switch highway=motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road|service true false
`;
const TAIL = `---context:node
assign initialcost = 0
`;

const PROFILES: Record<Curviness, string> = {
  // Predilige le strade grandi e scoraggia le svolte: più corto e più veloce.
  diretto:
    HEAD +
    `assign costfactor = switch not caraccess 100000 switch highway=motorway|motorway_link 100 switch highway=trunk|trunk_link 50 switch highway=primary|primary_link 1.0 switch highway=secondary|secondary_link 1.0 switch highway=tertiary|tertiary_link 1.6 switch highway=unclassified 3 switch highway=residential|living_street 5 switch highway=service 8 3
assign turncost = 80
assign initialcost = 0
` +
    TAIL,

  // Il comportamento storico dell'app: nessuna penalità di svolta, strade medie.
  equilibrato:
    HEAD +
    `assign costfactor = switch not caraccess 100000 switch highway=motorway|motorway_link 100 switch highway=trunk|trunk_link 50 switch highway=primary|primary_link 10 switch highway=secondary|secondary_link 1.0 switch highway=tertiary|tertiary_link 1.0 switch highway=unclassified 1.2 switch highway=residential|living_street 1.5 switch highway=service 4 1.8
assign turncost = 0
assign initialcost = 0
` +
    TAIL,

  // Cerca le stradine minori, dove stanno i tornanti.
  tortuoso:
    HEAD +
    `assign costfactor = switch not caraccess 100000 switch highway=motorway|motorway_link 10000 switch highway=trunk|trunk_link 5000 switch highway=primary|primary_link 60 switch highway=secondary|secondary_link 4 switch highway=tertiary|tertiary_link 1.0 switch highway=unclassified 1.0 switch highway=residential|living_street 1.6 switch highway=service 6 2
assign turncost = 0
assign initialcost = 0
` +
    TAIL,
};

const cache = new Map<Curviness, Promise<string | null>>();

export function getQuietProfileId(level: Curviness = 'equilibrato'): Promise<string | null> {
  let hit = cache.get(level);
  if (!hit) {
    hit = (async () => {
      try {
        const r = await fetch('https://brouter.de/brouter/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: PROFILES[level],
        });
        if (!r.ok) return null;
        const j = (await r.json()) as { profileid?: string };
        return j.profileid ?? null;
      } catch {
        return null;
      }
    })();
    cache.set(level, hit);
  }
  return hit;
}
