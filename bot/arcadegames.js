// PF-024 Item 23 – the arcade's game rules as PURE functions (no Discord, no D1, no clock), so the in-message version (bot/arcade.js) and a later Discord Activity share them.
// A game is { name, icon, blurb, init(), play(state, seat, move) → { state } | { error }, outcome(state) → null | { winner: 0 | 1 | null } , waiting(state) → [seats that must act] }.
// seat 0 is the player who started the game, seat 1 the invited member. State is plain JSON (stored whole in D1).
const other = (s) => 1 - s;

// ---------- Noughts and crosses (3x3) ----------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const ttt = {
  name: 'Noughts and crosses', icon: '❎', blurb: 'Three in a row on a 3 by 3 board',
  init: () => ({ b: Array(9).fill(null), t: 0, n: 0 }),
  play(s, seat, cell) {
    if (s.t !== seat) return { error: 'Not your turn.' };
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || s.b[cell] !== null) return { error: 'That square is taken.' };
    const b = s.b.slice(); b[cell] = seat;
    return { state: { b, t: other(seat), n: s.n + 1 } };
  },
  outcome(s) {
    for (const [a, b, c] of LINES) if (s.b[a] !== null && s.b[a] === s.b[b] && s.b[a] === s.b[c]) return { winner: s.b[a] };
    return s.b.every((x) => x !== null) ? { winner: null } : null;
  },
  waiting: (s) => [s.t],
};

// ---------- Connect four (7 columns, 6 rows) ----------
const ROWS = 6, COLS = 7;
const c4 = {
  name: 'Connect four', icon: '🔴', blurb: 'Drop discs, line up four',
  init: () => ({ g: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), t: 0, n: 0 }),
  play(s, seat, col) {
    if (s.t !== seat) return { error: 'Not your turn.' };
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return { error: 'Pick a column from 1 to 7.' };
    let r = ROWS - 1; while (r >= 0 && s.g[r][col] !== null) r--;
    if (r < 0) return { error: 'That column is full.' };
    const g = s.g.map((row) => row.slice()); g[r][col] = seat;
    return { state: { g, t: other(seat), n: s.n + 1 } };
  },
  outcome(s) {
    const g = s.g;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const v = g[r][c]; if (v === null) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let k = 1; while (k < 4 && g[r + dr * k]?.[c + dc * k] === v) k++;
        if (k === 4) return { winner: v };
      }
    }
    return g[0].every((x) => x !== null) ? { winner: null } : null;
  },
  waiting: (s) => [s.t],
};

// ---------- Rock paper scissors (first to 2 round wins, draws replay) ----------
const RPS = ['r', 'p', 's']; const BEATS = { r: 's', p: 'r', s: 'p' };
const rps = {
  name: 'Rock paper scissors', icon: '✂️', blurb: 'First to two rounds, picks stay hidden until both are in',
  init: () => ({ pick: [null, null], wins: [0, 0], log: [], n: 0 }),
  play(s, seat, v) {
    if (!RPS.includes(v)) return { error: 'Pick rock, paper or scissors.' };
    if (s.pick[seat] !== null) return { error: 'You already picked. Wait for the other player.' };
    const pick = s.pick.slice(); pick[seat] = v;
    const st = { ...s, pick, n: s.n + 1 };
    if (pick[0] !== null && pick[1] !== null) {
      const [a, b] = pick, win = a === b ? null : BEATS[a] === b ? 0 : 1;
      st.wins = s.wins.map((w, k) => (k === win ? w + 1 : w));
      st.log = [...s.log, [a, b]].slice(-10);
      st.pick = [null, null];
    }
    return { state: st };
  },
  outcome: (s) => (s.wins[0] >= 2 ? { winner: 0 } : s.wins[1] >= 2 ? { winner: 1 } : s.log.length >= 10 ? { winner: null } : null),
  waiting: (s) => [0, 1].filter((k) => s.pick[k] === null),
};

// ---------- Penalty shootout (5 kicks each, then sudden death in pairs, at most 10 pairs) ----------
// Kick k: seat k%2 shoots, the other keeps. Both choose left, middle or right at the same time; a different side is a goal.
const DIRS = ['l', 'm', 'r'];
const pens = {
  name: 'Penalty shootout', icon: '⚽', blurb: 'Shooter and keeper pick a side together, five kicks each',
  init: () => ({ k: 0, pick: [null, null], score: [0, 0], log: [], n: 0 }),
  play(s, seat, v) {
    if (!DIRS.includes(v)) return { error: 'Pick left, middle or right.' };
    if (s.pick[seat] !== null) return { error: 'You already picked. Wait for the other player.' };
    const pick = s.pick.slice(); pick[seat] = v;
    const st = { ...s, pick, n: s.n + 1 };
    if (pick[0] !== null && pick[1] !== null) {
      const shooter = s.k % 2, goal = pick[shooter] !== pick[other(shooter)];
      st.score = s.score.map((x, q) => (q === shooter && goal ? x + 1 : x));
      st.log = [...s.log, { s: shooter, a: pick[shooter], b: pick[other(shooter)], g: goal }].slice(-6);
      st.k = s.k + 1; st.pick = [null, null];
    }
    return { state: st };
  },
  outcome(s) {
    if (s.k < 10 || s.k % 2) return null; // after five kicks each, and then after each extra pair
    if (s.score[0] !== s.score[1]) return { winner: s.score[0] > s.score[1] ? 0 : 1 };
    return s.k >= 20 ? { winner: null } : null;
  },
  waiting: (s) => [0, 1].filter((k) => s.pick[k] === null),
};

export const GAMES = { ttt, c4, rps, pens };
export const GAME_KEYS = Object.keys(GAMES);
export const ROWS_C4 = ROWS, COLS_C4 = COLS;
