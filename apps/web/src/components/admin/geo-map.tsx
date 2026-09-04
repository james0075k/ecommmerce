'use client';

import * as React from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { GeoRow } from '@bazaar/shared';
import { formatPrice } from '@bazaar/ui';

import 'leaflet/dist/leaflet.css';

/** Roughly the whole country, used when there is nothing to fit to. */
const NEPAL_CENTER: [number, number] = [28.3949, 84.124];
const NEPAL_ZOOM = 6.4;

/**
 * Where the orders went.
 *
 * `CircleMarker` rather than the default pin, for two reasons that both matter
 * here. The pin needs an image asset, and Leaflet resolves that path relative
 * to the CSS - which breaks under a bundler unless the icon is manually
 * re-pointed, a well-known papercut with no upside. More importantly a circle
 * can be *sized*, so the marker carries the magnitude rather than just the
 * position: three orders and three hundred look different at a glance instead
 * of identical until clicked.
 *
 * This component is imported dynamically with `ssr: false` by its parent.
 * Leaflet reaches for `window` at module scope, so it cannot be rendered on the
 * server at all.
 */
export function GeoMap({ rows, height = 420 }: { rows: GeoRow[]; height?: number }) {
  const maxRevenue = React.useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.revenue), 0),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        No orders with a district recorded in this range.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border" style={{ height }}>
      <MapContainer
        center={NEPAL_CENTER}
        zoom={NEPAL_ZOOM}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%', background: 'var(--muted)' }}
      >
        {/* CARTO's light basemap rather than standard OSM: the default tiles
            are dense with labels that fight the markers for attention, and
            this is a data map, not a navigation one. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <FitToMarkers rows={rows} />

        {rows.map((row) => (
          <CircleMarker
            key={`${row.district}-${row.province}`}
            center={[row.latitude, row.longitude]}
            radius={radiusFor(row.revenue, maxRevenue)}
            pathOptions={{
              color: 'var(--bz-primary)',
              fillColor: 'var(--bz-primary)',
              fillOpacity: 0.45,
              weight: 1.5,
            }}
          >
            <Popup>
              <span className="block text-sm font-semibold">{row.district}</span>
              {row.province ? (
                <span className="block text-xs opacity-70">{row.province} Province</span>
              ) : null}
              <span className="mt-1.5 block text-xs">
                {row.orders} order{row.orders === 1 ? '' : 's'} · {formatPrice(row.revenue)}
              </span>
              <span className="block text-xs opacity-70">
                {row.customers} customer{row.customers === 1 ? '' : 's'}
              </span>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

/**
 * Frames the markers once they are known.
 *
 * A fixed centre would put a store selling only in the eastern hills in the
 * corner of a map of the whole country. `fitBounds` after mount is the only
 * place this can happen - the map instance does not exist until then.
 */
function FitToMarkers({ rows }: { rows: GeoRow[] }) {
  const map = useMap();

  React.useEffect(() => {
    if (rows.length === 0) return;

    const bounds = rows.map((row) => [row.latitude, row.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
  }, [map, rows]);

  return null;
}

/**
 * Area proportional to revenue, not radius.
 *
 * Doubling the radius quadruples the area, so scaling the radius linearly makes
 * a district with twice the revenue look four times as big. Taking the square
 * root is what makes the visual weight match the number.
 */
function radiusFor(revenue: number, max: number): number {
  const MIN = 6;
  const MAX = 28;

  if (max <= 0) return MIN;
  return MIN + Math.sqrt(revenue / max) * (MAX - MIN);
}
