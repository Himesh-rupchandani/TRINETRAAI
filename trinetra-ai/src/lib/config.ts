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

/**
 * Mapbox access token (public/scope-restricted token is fine — tile requests
 * are browser-side). Set VITE_MAPBOX_TOKEN in trinetra-ai/.env.local to fetch
 * the Mapbox basemaps; without it the Mapbox entries are hidden and the
 * keyless OSM/Esri pair is used as before.
 *
 * Validation: must start with pk. and be at least 20 chars. This prevents
 * empty or placeholder tokens from causing 401 tile errors that blank the map.
 */
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

/**
 * Safe number parser with fallback and range check.
 * Prevents NaN centers (e.g. empty env var -> 0,0) that would send the map to Null Island.
 */
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

/**
 * Reliable tile providers — NO API KEY NEEDED for street/satellite.
 * - OSM: most reliable free tiles, uses a,b,c subdomains for parallel loading
 * - Esri World Imagery: free satellite, no key
 * - Mapbox: only when valid pk. token present; otherwise hidden
 *
 * Previous Carto URL used {r} placeholder which can 404 on some Leaflet versions.
 * OSM with subdomains is the most compatible fallback.
 */
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
  // Mapbox raster tiles — only used when token is present; MapView auto-falls back to street on errors
  // Using 256/tiles endpoint (modern Mapbox Styles API) for better compatibility
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

/** Basemaps actually available — Mapbox only shows when a VALID token is configured. */
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
  // The backend serves both SSE (/api/stream) and WebSocket (/api/ws/events).
  // SSE is the default: it traverses reverse proxies cleanly and reconnects
  // natively in the browser.
  realtimeTransport: (env.VITE_REALTIME_TRANSPORT ?? 'sse') as 'sse' | 'ws' | 'off',
  /**
   * Same-origin path the UI posts WHEP offers to. A server-side proxy maps it
   * onto the Sentinel media gateway, so the browser never sees the gateway
   * origin and the bundle carries no credentials.
   */
  streamBasePath: env.VITE_STREAM_BASE_PATH ?? '/sentinel/stream',
  liveStreams: (env.VITE_LIVE_STREAMS ?? 'true') !== 'false',
  /**
   * In mock mode, static deployments (e.g. Vercel) have no server-side
   * Sentinel proxy, so the safe default is an in-bundle demo loop. Set to
   * `sentinel` only when a same-origin /sentinel proxy exists.
   */
  mockCameraPlayback: ((env.VITE_MOCK_CAMERA_PLAYBACK ?? 'demo').trim().toLowerCase() === 'sentinel'
    ? 'sentinel'
    : 'demo') as 'demo' | 'sentinel',
  autoLogin: (env.VITE_AUTO_LOGIN ?? 'true') !== 'false',
  // Default live camera to auto-show on dashboard when website runs
  defaultLiveCameraId: (env.VITE_DEFAULT_LIVE_CAMERA ?? 'cam04') as string,
  map: {
    center: [defaultCenterLat, defaultCenterLng] as [number, number],
    zoom: defaultZoom,
    /**
     * Switchable basemaps, tracking-console style.
     * Street = OSM (keyless, most reliable). Satellite = Esri World Imagery + labels (keyless).
     * When a valid Mapbox token is configured (VITE_MAPBOX_TOKEN=pk.*) the Mapbox
     * Streets/Night/Hybrid/Satellite styles join the toggle and become the default.
     * MapView has auto-fallback: if Mapbox tiles 401/404 repeatedly, it switches to OSM.
     */
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
