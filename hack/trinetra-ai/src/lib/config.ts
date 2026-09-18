/**
 * Browser-safe runtime configuration.
 * Everything here is compiled into the public bundle — never place
 * passwords, private keys or Sentinel credentials in these variables.
 */
const env = import.meta.env;

export type BasemapId = 'street' | 'satellite' | 'mapbox' | 'mapbox-night' | 'mapbox-hybrid' | 'mapbox-satellite';

export type TileConfig = {
  base: string;
  labels?: string;
  maxZoom?: number;
  minZoom?: number;
  subdomains?: string | string[];
};

function getMapboxToken(): string {
  const raw = (env.VITE_MAPBOX_TOKEN ?? '').trim();
  if (!raw) return '';
  if (!raw.startsWith('pk.')) return '';
  if (raw.length < 20) return '';
  return raw;
}

export const mapboxToken = getMapboxToken();
export const mapboxEnabled = mapboxToken.length > 0;

const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong><a href="https://www.mapbox.com/map-feedback/">Improve this map</a></strong>';

function safeNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

function safeZoom(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 1 || n > 20) return fallback;
  return n;
}

const mapTiles: Record<BasemapId, TileConfig> = {
  street: {
    base: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    minZoom: 3,
  },
  satellite: {
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    minZoom: 3,
  },
  mapbox: {
    base: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
    maxZoom: 20,
    minZoom: 3,
  },
  'mapbox-night': {
    base: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
    maxZoom: 20,
    minZoom: 3,
  },
  'mapbox-satellite': {
    base: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
    maxZoom: 20,
    minZoom: 3,
  },
  'mapbox-hybrid': {
    base: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
    maxZoom: 20,
    minZoom: 3,
  },
};

export const basemaps: { id: BasemapId; label: string }[] = [
  ...(mapboxEnabled
    ? ([
        { id: 'mapbox', label: 'Mapbox' },
        { id: 'mapbox-night', label: 'Night' },
        { id: 'mapbox-hybrid', label: 'Hybrid' },
        { id: 'mapbox-satellite', label: 'Satellite' },
      ] as { id: BasemapId; label: string }[])
    : []),
  { id: 'street', label: 'OSM Map' },
  { id: 'satellite', label: 'Satellite' },
];

const defaultCenterLat = safeNum(env.VITE_MAP_CENTER_LAT ?? 22.3, 22.3, -90, 90);
const defaultCenterLng = safeNum(env.VITE_MAP_CENTER_LNG ?? 71.6, 71.6, -180, 180);
const defaultZoom = safeZoom(env.VITE_MAP_DEFAULT_ZOOM ?? 7, 7);

export const config = {
  appName: 'TRINETRA AI',
  tagline: 'Intelligent Vision. Faster Response.',
  useMocks: (env.VITE_USE_MOCKS ?? 'true') !== 'false',
  apiBaseUrl: env.VITE_API_BASE_URL ?? '/api',
  realtimeTransport: (env.VITE_REALTIME_TRANSPORT ?? 'sse') as 'sse' | 'ws' | 'off',
  streamBasePath: env.VITE_STREAM_BASE_PATH ?? '/sentinel/stream',
  liveStreams: (env.VITE_LIVE_STREAMS ?? 'true') !== 'false',
  autoLogin: (env.VITE_AUTO_LOGIN ?? 'true') !== 'false',
  defaultLiveCameraId: (env.VITE_DEFAULT_LIVE_CAMERA ?? 'cam04') as string,
  map: {
    center: [defaultCenterLat, defaultCenterLng] as [number, number],
    zoom: defaultZoom,
    tiles: mapTiles,
    basemaps,
    defaultBasemap: (mapboxEnabled ? 'mapbox' : 'street') as BasemapId,
    attribution: {
      street: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      satellite:
        'Imagery &copy; Esri, Maxar, Earthstar Geographics &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
      mapbox: MAPBOX_ATTRIBUTION,
      'mapbox-night': MAPBOX_ATTRIBUTION,
      'mapbox-satellite': MAPBOX_ATTRIBUTION,
      'mapbox-hybrid': MAPBOX_ATTRIBUTION,
    },
  },
  demo: {
    primaryPlate: 'GJ01AB1234',
  },
} as const;

export type AppConfig = typeof config;
