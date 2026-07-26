/**
 * "Strade tranquille" routing via a custom BRouter profile (keyless).
 * ORS's avoid_features only skips real motorways, not Italian superstrade
 * (trunk roads like the E45). This car-legal profile penalises motorway/trunk/
 * primary and prefers secondary/tertiary, so the route avoids the fast
 * dual-carriageways where a smaller road exists.
 *
 * brouter.de accepts an uploaded profile and returns a (possibly ephemeral)
 * profile id, so we re-upload once per session and cache the id.
 */
const PROFILE = `---context:global
assign turnInstructionMode = 0
---context:way
assign caraccess = switch access=no|private false switch highway=motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road|service true false
assign costfactor = switch not caraccess 100000 switch highway=motorway|motorway_link 100 switch highway=trunk|trunk_link 50 switch highway=primary|primary_link 10 switch highway=secondary|secondary_link 1.0 switch highway=tertiary|tertiary_link 1.0 switch highway=unclassified 1.2 switch highway=residential|living_street 1.5 switch highway=service 4 1.8
assign turncost = 0
assign initialcost = 0
---context:node
assign initialcost = 0
`;

let cached: Promise<string | null> | null = null;

export function getQuietProfileId(): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const r = await fetch('https://brouter.de/brouter/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: PROFILE,
        });
        if (!r.ok) return null;
        const j = (await r.json()) as { profileid?: string };
        return j.profileid ?? null;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
