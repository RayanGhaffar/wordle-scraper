# Wordle Tracker

A shared website for tracking your group's daily Wordle results: fastest solves, averages, a win leaderboard, and full history — no accounts, no build step, no dependencies to install.

## Run it locally

You need [Node.js](https://nodejs.org) installed (v18+). Nothing else.

```
node server.js
```

Then open **http://localhost:3000**. That's it — no `npm install` required, since the whole app is built on Node's built-in modules.

Your data is stored in `data/results.json` and `data/players.json` as plain files.

## How everyone uses it

1. Someone plays Wordle and taps "Share" in the Wordle app (same text you'd paste into the group chat).
2. They open the site, pick their name (or add it the first time), paste the share text into the box, and hit **Add result**.
3. The site parses the puzzle number, attempts, and win/fail automatically.

## What each tab shows

- **Today** — who's posted today's puzzle, in order, with a crown on whoever solved it fastest.
- **Leaderboard** — total number of daily wins per person (fastest solve of the day).
- **Averages** — average guesses to solve (fails aren't counted in the average, but are shown alongside it).
- **History** — every puzzle, every player, at a glance.

## Deploying so everyone can access it (not just your machine)

Since there's no database server or native dependencies, this deploys almost anywhere that runs Node:

**Render / Railway / Fly.io (all have free tiers)**
1. Push this folder to a GitHub repo.
2. Create a new "Web Service" pointing at the repo.
3. Start command: `node server.js`
4. No build command needed.
5. **Important:** these platforms often use an *ephemeral* filesystem, meaning `data/results.json` can reset on redeploy. If you deploy to one of these, ask about "persistent disk" / "volumes" (Render and Fly both offer a small free persistent volume) and mount it at `/data`, then update `DATA_DIR` in `server.js` to point there.

**A spare computer / Raspberry Pi / home server**
- Simplest option for keeping data forever: just run `node server.js` on any machine that's on, and use a service like [ngrok](https://ngrok.com) or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) to give your friends a stable URL.

Once deployed, share the URL in your group chat and everyone bookmarks it.

## Notes on the stats logic

- **"Win"** = whoever's solved result has the earliest timestamp for that puzzle number.
- **Average** only counts puzzles you solved — fails are tracked separately (shown as "X solved · Y failed") rather than dragging the average down, since averaging in a fixed penalty is a judgment call. If you'd rather fails count as a 7th guess in the average, that's a one-line change in `app.js` (`computePlayerStats`) — happy to make that change if you want it.
- Re-pasting the same puzzle for the same person overwrites their old entry rather than duplicating it (handy for correcting a typo).

## File structure

```
wordle-tracker/
  server.js          — the whole backend (routing, parsing, storage)
  data/
    results.json      — every submitted result
    players.json       — list of names
  public/
    index.html         — page structure
    style.css          — design system
    app.js              — stats computation + rendering
```
