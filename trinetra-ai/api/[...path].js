const { Readable } = require('node:stream');

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function backendOrigin() {
  return trimSlash(process.env.BACKEND_ORIGIN || process.env.LIVE_API_ORIGIN || '');
}

function forwardedHeaders(req) {
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
    'last-event-id',
    'authorization',
  ];
  for (const name of allow) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) out.set(name, value);
  }
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
  return url.pathname.replace(/^\/api\/?/, '');
}

function buildTarget(req, path, origin) {
  const url = new URL(req.url, 'http://local');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return new URL(`/api/${cleanPath}${url.search}`, `${origin}/`).toString();
}

function copyHeaders(res, upstream) {
  const pass = [
    'cache-control',
    'content-disposition',
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
  res.setHeader('x-trinetra-proxy', 'vercel-backend');
}

module.exports = async (req, res) => {
  const origin = backendOrigin();
  const path = resolvePath(req);

  if (!origin) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        detail:
          'Live backend is not configured on this deployment. Set BACKEND_ORIGIN in Vercel Project Settings and redeploy.',
      }),
    );
    return;
  }

  if (!path || path.startsWith('sentinel/')) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ detail: 'Not found.' }));
    return;
  }

  const target = buildTarget(req, path, origin);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardedHeaders(req),
      body: await readBody(req),
      redirect: 'manual',
    });

    res.statusCode = upstream.status;
    copyHeaders(res, upstream);

    if (req.method === 'HEAD' || upstream.status === 204 || !upstream.body) {
      res.end();
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (/text\/event-stream/i.test(contentType)) {
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('connection', 'keep-alive');
      await new Promise((resolve, reject) => {
        Readable.fromWeb(upstream.body).pipe(res);
        res.on('close', resolve);
        res.on('finish', resolve);
        res.on('error', reject);
      });
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
            ? `Backend proxy failed: ${error.message}`
            : 'Backend proxy failed.',
      }),
    );
  }
};
