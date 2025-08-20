import express from 'express';

const app = express();
const feedsApp = express();
app.set('trust proxy', true);
feedsApp.set('trust proxy', true);

// Catch incoming links
app.get('/', (req, res) => {
  let { orgID, projectID, action } = req.query;

  // Be forgiving of malformed concatenation like: projectID=8609960target=project
  if (typeof projectID === 'string' && projectID.includes('target=')) {
    const [proj, rest] = projectID.split('target=');
    projectID = proj;
  }

  // Only act on expected requests. Everything else gets a quiet 204 to avoid bot noise.
  if (!projectID || action !== 'initialSetup') {
    return res.status(204).end();
  }

  // Log only meaningful events
  console.log('[FVButtonRelay] Valid link', {
    fromIp: req.ip,
    method: req.method,
    path: req.path,
    query: { orgID, projectID, action },
    userAgent: req.get('user-agent'),
    time: new Date().toISOString(),
  });

  // Publish to feeds by action type
  publishEvent(action, {
    orgID,
    projectID,
    action,
    fromIp: req.ip,
    userAgent: req.get('user-agent'),
    receivedAt: new Date().toISOString(),
  });

  // Always redirect to the project activity using projectID
  const redirectUrl = `https://bls.filevineapp.com/#/project/${encodeURIComponent(
    String(projectID)
  )}/activity`;

  // Temporary redirect (302) back to the Filevine project activity
  return res.redirect(302, redirectUrl);
});

// Optional: simple health checks
app.get('/health', (_req, res) => { res.status(200).send('ok'); });
feedsApp.get('/health', (_req, res) => { res.status(200).send('ok'); });

// --- Simple in-memory pub-sub for SSE feeds ---
const subscribers = new Map(); // action -> Set(res)

function getSubscribersSet(action) {
  if (!subscribers.has(action)) subscribers.set(action, new Set());
  return subscribers.get(action);
}

function publishEvent(action, payload) {
  const set = getSubscribersSet(action);
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch (_) { /* ignore broken pipe */ }
  }
}

// SSE endpoint per action: /events/:action
feedsApp.get('/events/:action', (req, res) => {
  const { action } = req.params;

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Track subscriber
  const set = getSubscribersSet(action);
  set.add(res);

  // Heartbeat to keep connection alive
  const hb = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* ignore */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    set.delete(res);
    try { res.end(); } catch (_) { /* ignore */ }
  });
});

const PORT = process.env.PORT || 4020; // main catcher
const FEEDS_PORT = process.env.FEEDS_PORT || 4021; // SSE feeds

app.listen(PORT, () => {
  console.log(`FVButtonRelay catcher listening on port ${PORT}`);
});

feedsApp.listen(FEEDS_PORT, () => {
  console.log(`FVButtonRelay feeds server listening on port ${FEEDS_PORT}`);
});
