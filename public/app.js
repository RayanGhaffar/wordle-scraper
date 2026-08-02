const state = { results: [], players: [] };

const ATTEMPT_COLOR_VAR = {
  1: '--t1', 2: '--t2', 3: '--t3', 4: '--t4', 5: '--t5', 6: '--t6',
};

// ---------- data loading ----------

async function loadData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  state.results = data.results || [];
  state.players = data.players || [];
  populatePlayerSelect();
  renderActiveTab();
}

function populatePlayerSelect() {
  const select = document.getElementById('player-select');
  const current = select.value;
  select.innerHTML = '';
  if (state.players.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No names yet — add one →';
    select.appendChild(opt);
    return;
  }
  state.players
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  if (state.players.includes(current)) select.value = current;
}

// ---------- tile-strip rendering ----------

function tileStripHTML(attempts) {
  // attempts: 1-6, or null for a fail
  let squares = '';
  if (attempts === null) {
    squares += `<div class="tile fail" title="Failed"></div>`;
    for (let i = 0; i < 5; i++) squares += `<div class="tile empty"></div>`;
    return `<div class="tile-strip">${squares}</div>`;
  }
  for (let i = 1; i <= 6; i++) {
    if (i <= attempts) {
      const varName = ATTEMPT_COLOR_VAR[attempts];
      squares += `<div class="tile" style="background:var(${varName})"></div>`;
    } else {
      squares += `<div class="tile empty"></div>`;
    }
  }
  return `<div class="tile-strip">${squares}</div>`;
}

function miniTileHTML(record) {
  if (!record) return `<span class="mini-tile empty">–</span>`;
  if (!record.solved) {
    return `<span class="mini-tile" style="background:var(--tfail);color:#fff">X</span>`;
  }
  const varName = ATTEMPT_COLOR_VAR[record.attempts];
  return `<span class="mini-tile" style="background:var(${varName})">${record.attempts}</span>`;
}

// ---------- stats computation ----------

function getLatestPuzzleNumber() {
  if (state.results.length === 0) return null;
  return Math.max(...state.results.map((r) => r.puzzleNumber));
}

function computePlayerStats() {
  const byPlayer = {};
  state.players.forEach((p) => {
    byPlayer[p] = { player: p, games: 0, solves: 0, fails: 0, totalAttempts: 0, wins: 0 };
  });

  state.results.forEach((r) => {
    if (!byPlayer[r.player]) {
      byPlayer[r.player] = { player: r.player, games: 0, solves: 0, fails: 0, totalAttempts: 0, wins: 0 };
    }
    const p = byPlayer[r.player];
    p.games += 1;
    if (r.solved) {
      p.solves += 1;
      p.totalAttempts += r.attempts;
    } else {
      p.fails += 1;
    }
  });

  // wins: earliest solved submission per puzzle number
  const byPuzzle = {};
  state.results.forEach((r) => {
    if (!r.solved) return;
    if (!byPuzzle[r.puzzleNumber]) byPuzzle[r.puzzleNumber] = [];
    byPuzzle[r.puzzleNumber].push(r);
  });
  Object.values(byPuzzle).forEach((entries) => {
    let earliest = entries[0];
    entries.forEach((e) => {
      if (new Date(e.submittedAt) < new Date(earliest.submittedAt)) earliest = e;
    });
    if (byPlayer[earliest.player]) byPlayer[earliest.player].wins += 1;
  });

  return Object.values(byPlayer).map((p) => ({
    ...p,
    avgAttempts: p.solves > 0 ? p.totalAttempts / p.solves : null,
  }));
}

// ---------- tab rendering ----------

function renderActiveTab() {
  const active = document.querySelector('.tab.active').dataset.tab;
  if (active === 'today') renderToday();
  if (active === 'leaderboard') renderLeaderboard();
  if (active === 'averages') renderAverages();
  if (active === 'history') renderHistory();
}

function renderToday() {
  const el = document.getElementById('today-content');
  const latest = getLatestPuzzleNumber();
  if (latest === null) {
    el.innerHTML = `<div class="empty-state">No results yet. Paste your first Wordle share text above to get started.</div>`;
    return;
  }
  const todays = state.results
    .filter((r) => r.puzzleNumber === latest)
    .slice()
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

  const winner = todays.find((r) => r.solved);
  let html = `<h3 class="section-heading">Puzzle #${latest.toLocaleString()}</h3>`;

  if (todays.length === 0) {
    html += `<div class="empty-state">Nobody's posted today's result yet.</div>`;
  } else {
    todays.forEach((r, i) => {
      const isWinner = winner && r.player === winner.player && r.solved;
      html += `
        <div class="row-card">
          <div class="row-left">
            <span class="player-name">${escapeHTML(r.player)} ${isWinner ? '<span class="crown">👑</span>' : ''}</span>
          </div>
          ${tileStripHTML(r.attempts)}
          <span class="attempts-label">${r.solved ? r.attempts + '/6' : 'X/6'}</span>
        </div>`;
    });
  }

  // who hasn't posted
  const posted = new Set(todays.map((r) => r.player));
  const missing = state.players.filter((p) => !posted.has(p));
  if (missing.length > 0) {
    html += `<p class="hint" style="margin-top:16px">Still waiting on: ${missing.map(escapeHTML).join(', ')}</p>`;
  }

  el.innerHTML = html;
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-content');
  const stats = computePlayerStats().filter((p) => p.games > 0);
  if (stats.length === 0) {
    el.innerHTML = `<div class="empty-state">No results yet — the leaderboard fills in as people post.</div>`;
    return;
  }
  stats.sort((a, b) => b.wins - a.wins || (b.avgAttempts === null ? 1 : a.avgAttempts - b.avgAttempts));

  let html = `<h3 class="section-heading">Most daily wins</h3>`;
  stats.forEach((p, i) => {
    html += `
      <div class="row-card">
        <div class="row-left">
          <span class="rank-num">${i + 1}</span>
          <span class="player-name">${escapeHTML(p.player)}</span>
        </div>
        <span class="stat-num">${p.wins} ${p.wins === 1 ? 'win' : 'wins'}</span>
      </div>`;
  });
  el.innerHTML = html;
}

function renderAverages() {
  const el = document.getElementById('averages-content');
  const stats = computePlayerStats().filter((p) => p.games > 0);
  if (stats.length === 0) {
    el.innerHTML = `<div class="empty-state">No results yet — averages fill in as people post.</div>`;
    return;
  }
  stats.sort((a, b) => {
    if (a.avgAttempts === null) return 1;
    if (b.avgAttempts === null) return -1;
    return a.avgAttempts - b.avgAttempts;
  });

  let html = `<h3 class="section-heading">Average guesses to solve</h3>`;
  stats.forEach((p) => {
    const avgLabel = p.avgAttempts === null ? '—' : p.avgAttempts.toFixed(2);
    html += `
      <div class="row-card">
        <div class="row-left">
          <span class="player-name">${escapeHTML(p.player)}</span>
        </div>
        <div style="text-align:right">
          <div class="stat-num">${avgLabel}</div>
          <div class="hint" style="margin:2px 0 0">${p.solves} solved · ${p.fails} failed</div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
}

function renderHistory() {
  const el = document.getElementById('history-content');
  if (state.results.length === 0) {
    el.innerHTML = `<div class="empty-state">No history yet.</div>`;
    return;
  }
  const puzzleNumbers = [...new Set(state.results.map((r) => r.puzzleNumber))].sort((a, b) => b - a);
  const players = state.players.slice().sort((a, b) => a.localeCompare(b));

  let html = `<div class="history-table-wrap"><table class="history"><thead><tr><th>Puzzle</th>`;
  players.forEach((p) => (html += `<th>${escapeHTML(p)}</th>`));
  html += `</tr></thead><tbody>`;

  puzzleNumbers.forEach((num) => {
    html += `<tr><td>#${num.toLocaleString()}</td>`;
    players.forEach((p) => {
      const record = state.results.find((r) => r.puzzleNumber === num && r.player === p);
      html += `<td>${miniTileHTML(record)}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- tab switching ----------

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    renderActiveTab();
  });
});

// ---------- new player toggle ----------

const newPlayerBtn = document.getElementById('new-player-btn');
const newPlayerInput = document.getElementById('new-player-input');
const playerSelect = document.getElementById('player-select');

newPlayerBtn.addEventListener('click', () => {
  const showing = newPlayerInput.style.display !== 'none';
  if (showing) {
    newPlayerInput.style.display = 'none';
    playerSelect.style.display = '';
    newPlayerBtn.textContent = '+ New name';
  } else {
    newPlayerInput.style.display = '';
    playerSelect.style.display = 'none';
    newPlayerBtn.textContent = 'Use existing';
    newPlayerInput.focus();
  }
});

// ---------- form submit ----------

const form = document.getElementById('add-form');
const formMessage = document.getElementById('form-message');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.textContent = '';
  formMessage.className = 'form-message';

  const usingNewPlayer = newPlayerInput.style.display !== 'none';
  const player = usingNewPlayer ? newPlayerInput.value.trim() : playerSelect.value;
  const rawText = document.getElementById('raw-text').value;

  if (!player) {
    formMessage.textContent = 'Pick or enter a name first.';
    formMessage.classList.add('error');
    return;
  }

  try {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, rawText }),
    });
    const data = await res.json();
    if (!res.ok) {
      formMessage.textContent = data.error || 'Something went wrong.';
      formMessage.classList.add('error');
      return;
    }
    formMessage.textContent = `Added! Puzzle #${data.saved.puzzleNumber.toLocaleString()} — ${data.saved.solved ? data.saved.attempts + '/6' : 'X/6'} for ${player}.`;
    formMessage.classList.add('success');
    document.getElementById('raw-text').value = '';
    newPlayerInput.value = '';
    if (usingNewPlayer) {
      newPlayerInput.style.display = 'none';
      playerSelect.style.display = '';
      newPlayerBtn.textContent = '+ New name';
    }
    state.results = data.results;
    state.players = data.players;
    populatePlayerSelect();
    if (state.players.includes(player)) playerSelect.value = player;
    renderActiveTab();
  } catch (err) {
    formMessage.textContent = 'Network error — is the server running?';
    formMessage.classList.add('error');
  }
});

// ---------- init ----------

loadData();
