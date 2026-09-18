const DEFAULT_WHEP_ORIGIN = 'http://103.250.160.189:8889';

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function deriveHlsOrigin(whepOrigin) {
  try {
    const u = new URL(whepOrigin || DEFAULT_WHEP_ORIGIN);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return 'http://103.250.160.189';
  }
}

function sentinelConfig() {
  const whepOrigin = trimSlash(process.env.SENTINEL_WHEP_ORIGIN || DEFAULT_WHEP_ORIGIN);
  const hlsOrigin = trimSlash(process.env.SENTINEL_HLS_ORIGIN || deriveHlsOrigin(whepOrigin));
  const email = String(process.env.SENTINEL_EMAIL || '').trim();
  const password = String(process.env.SENTINEL_PASSWORD || '').trim();
  return {
    whepOrigin,
    hlsOrigin,
    authHeader: email && password ? `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}` : null,
  };
}

function forwardedHeaders(req, authHeader) {
  const out = new Headers();
  const allow = [
    'accept',
    'accept-language',
    'cache-control',
    'content-type',
    'if-match',
    'if-none-match',
    'if-modified-since',
    'range',
    'user-agent',
  ];
  for (const name of allow) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) out.set(name, value);
  }
  if (authHeader) out.set('authorization', authHeader);
  return out;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function resolvePath(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw) && raw.length) return raw.join('/');
  if (typeof raw === 'string' && raw) return raw;
  const url = new URL(req.url, 'http://local');
  return url.pathname.replace(/^\/api\/sentinel\/?/, '');
}

function buildTarget(req, path, cfg) {
  const url = new URL(req.url, 'http://local');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const base = cleanPath.startsWith('live/') ? cfg.hlsOrigin : cfg.whepOrigin;
  return new URL(`/${cleanPath}${url.search}`, `${base}/`).toString();
}

function rewriteLocation(location) {
  if (!location) return null;
  let path = String(location);
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      path = `${u.pathname}${u.search}`;
    } catch {
      return location;
    }
  }
  return `/sentinel${path.startsWith('/') ? '' : '/'}${path}`;
}

function copyUpstreamHeaders(res, upstream) {
  const pass = [
    'cache-control',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
    'www-authenticate',
    'accept-ranges',
  ];
  for (const name of pass) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const rewrittenLocation = rewriteLocation(upstream.headers.get('location'));
  if (rewrittenLocation) res.setHeader('location', rewrittenLocation);
  res.setHeader('x-trinetra-proxy', 'vercel-sentinel');
}

function maybeRewriteManifest(body, cfg) {
  return body
    .replaceAll(cfg.hlsOrigin, '/sentinel')
    .replaceAll(cfg.whepOrigin, '/sentinel');
}

module.exports = async (req, res) => {
  const cfg = sentinelConfig();
  const path = resolvePath(req);

  if (!path) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ detail: 'Missing Sentinel path.' }));
    return;
  }

  if (!cfg.authHeader) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        detail:
          'Sentinel credentials are not configured on this deployment. Set SENTINEL_EMAIL and SENTINEL_PASSWORD in Vercel Project Settings → Environment Variables, then redeploy.',
      }),
    );
    return;
  }

  const target = buildTarget(req, path, cfg);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardedHeaders(req, cfg.authHeader),
      body: await readBody(req),
      redirect: 'manual',
    });

    copyUpstreamHeaders(res, upstream);
    res.statusCode = upstream.status;

    if (req.method === 'HEAD' || upstream.status === 204) {
      res.end();
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (/mpegurl|m3u8/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(target)) {
      const text = await upstream.text();
      res.end(maybeRewriteManifest(text, cfg));
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        detail:
          error instanceof Error
            ? `Sentinel proxy failed: ${error.message}`
            : 'Sentinel proxy failed.',
      }),
    );
  }
};
