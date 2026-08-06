// Wordle Group Tracker — zero-dependency Node server
// Run with: node server.js  (no npm install needed)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// empty data directory if files don't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(RESULTS_FILE)) {
  fs.writeFileSync(RESULTS_FILE, '[]');
}
if (!fs.existsSync(PLAYERS_FILE)) {
  fs.writeFileSync(PLAYERS_FILE, '[]');
}

// ---------- storage helpers ----------

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getResults() {
  return readJSON(RESULTS_FILE);
}

function getPlayers() {
  return readJSON(PLAYERS_FILE);
}

// ---------- Wordle text parser ----------
// Accepts formats like:
//   "Wordle 1,234 4/6"
//   "Wordle #1,234 4/6"
//   "Wordle 1234 X/6"
function parseWordleText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/Wordle\s*#?\s*([\d,]+)\s+([1-6xX])\s*\/\s*6/);
  if (!match) return null;
  const puzzleNumber = parseInt(match[1].replace(/,/g, ''), 10);
  const attemptsRaw = match[2].toUpperCase();
  const solved = attemptsRaw !== 'X';
  const attempts = solved ? parseInt(attemptsRaw, 10) : null;
  if (Number.isNaN(puzzleNumber)) return null;
  return { puzzleNumber, attempts, solved };
}

// ---------- request helpers ----------

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.join(PUBLIC_DIR, filePath);
  // prevent path traversal
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- API handlers ----------

async function handleApi(req, res, pathname) {
  // GET /api/data -> everything the frontend needs
  if (pathname === '/api/data' && req.method === 'GET') {
    return sendJSON(res, 200, { results: getResults(), players: getPlayers() });
  }

  // GET /api/export -> downloadable JSON backup of all data
  if (pathname === '/api/export' && req.method === 'GET') {
    const backup = {
      exportedAt: new Date().toISOString(),
      results: getResults(),
      players: getPlayers(),
    };
    const body = JSON.stringify(backup, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="wordle-tracker-backup-${dateStamp}.json"`,
      'Content-Length': Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // POST /api/players  { name }
  if (pathname === '/api/players' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return sendJSON(res, 400, { error: 'Name is required' });
      const players = getPlayers();
      if (!players.includes(name)) {
        players.push(name);
        writeJSON(PLAYERS_FILE, players);
      }
      return sendJSON(res, 200, { players });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  // POST /api/results  { player, rawText }
  if (pathname === '/api/results' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const player = (body.player || '').trim();
      const rawText = body.rawText || '';
      if (!player) return sendJSON(res, 400, { error: 'Player name is required' });

      const parsed = parseWordleText(rawText);
      if (!parsed) {
        return sendJSON(res, 400, {
          error:
            "Couldn't find a Wordle result in that text. Paste the full share text, e.g. \"Wordle 1,234 4/6\".",
        });
      }

      // ensure player exists in players list
      const players = getPlayers();
      if (!players.includes(player)) {
        players.push(player);
        writeJSON(PLAYERS_FILE, players);
      }

      const results = getResults();
      const existingIdx = results.findIndex(
        (r) => r.player === player && r.puzzleNumber === parsed.puzzleNumber
      );
      const record = {
        player,
        puzzleNumber: parsed.puzzleNumber,
        attempts: parsed.attempts,
        solved: parsed.solved,
        submittedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        // resubmission: replaces the old entry with the new 
        results.splice(existingIdx, 1);
      }
      results.push(record);
      writeJSON(RESULTS_FILE, results);

      return sendJSON(res, 200, { results, players: getPlayers(), saved: record });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message || 'Invalid request' });
    }
  }

  // DELETE /api/results  { player, puzzleNumber }
  if (pathname === '/api/results' && req.method === 'DELETE') {
    try {
      const body = await readBody(req);
      const results = getResults().filter(
        (r) => !(r.player === body.player && r.puzzleNumber === body.puzzleNumber)
      );
      writeJSON(RESULTS_FILE, results);
      return sendJSON(res, 200, { results });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Wordle Tracker running at http://localhost:${PORT}`);
});