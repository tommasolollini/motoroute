import type { Feature, LineString } from 'geojson';
import type { LngLat } from 'maplibre-gl';

interface GpxOptions {
  name: string;
  start: LngLat;
  end: LngLat;
}

/** Builds a GPX 1.1 document: A/B as waypoints, the full track as a trkseg. */
export function buildGpx(feature: Feature<LineString>, opts: GpxOptions): string {
  const coords = feature.geometry.coordinates;
  const trkpts = coords
    .map((c) => {
      const ele = c.length > 2 ? `<ele>${c[2]}</ele>` : '';
      return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${ele}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MotoRoute" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(opts.name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <wpt lat="${opts.start.lat.toFixed(6)}" lon="${opts.start.lng.toFixed(6)}"><name>Partenza</name></wpt>
  <wpt lat="${opts.end.lat.toFixed(6)}" lon="${opts.end.lng.toFixed(6)}"><name>Destinazione</name></wpt>
  <trk>
    <name>${escapeXml(opts.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Triggers a client-side download of the GPX file. */
export function downloadGpx(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.gpx') ? filename : `${filename}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  );
}
