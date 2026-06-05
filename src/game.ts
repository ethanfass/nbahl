import type { Player, StatDef } from './types';
import { PLAYERS } from './data/players';
import { eligibleStats } from './stats';

// Game modes:
//  - 'unlimited': keep going until you miss one (no clock).
//  - 'timed': score as many as you can before the clock runs out; a miss does
//    NOT end the run, only the clock does.
//  - 'daily': a fixed, seed-of-the-day run of DAILY_TARGET rounds, identical for
//    everyone that day. A miss fails the attempt; reach the target to beat the day.
//    The clock counts up (like unlimited) and your attempt count is tracked.
export type Mode = 'unlimited' | 'timed' | 'daily';

export const TIMED_SECONDS = 60;
export const DAILY_TARGET = 20;

function bestKey(mode: Mode): string {
    return `nba-hl-best-${mode}`;
}

// ---- seeded RNG (for the daily) --------------------------------------------
// xmur3 string hash -> mulberry32 PRNG. Same date => same sequence for everyone.

function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

function mulberry32(a: number): () => number {
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededRng(seed: string): () => number {
    return mulberry32(xmur3(seed)());
}

// Local YYYY-MM-DD — the daily seed and storage key.
export function todayKey(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

// ---- daily progress (per calendar day) -------------------------------------

const DAILY_KEY = 'nba-hl-daily';

export interface DailyRecord {
    date: string;
    attempts: number; // the current attempt number (1-based); bumps after each failed try
    won: boolean;
}

export function loadDaily(): DailyRecord {
    try {
        const r = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
        if (r && r.date === todayKey()) return r;
    } catch { /* ignore malformed */ }
    return { date: todayKey(), attempts: 1, won: false };
}

function saveDaily(r: DailyRecord): void {
    localStorage.setItem(DAILY_KEY, JSON.stringify(r));
}

export interface Round {
    left: Player;   // the known/reference player (value shown)
    right: Player;  // the player being guessed (value hidden until you answer)
    stat: StatDef;
}

export interface GameState {
    mode: Mode;
    round: Round;
    score: number;
    best: number;
    startBest: number; // best at the start of this run — the record to beat (for streak coloring)
    over: boolean;
    won: boolean;          // daily only: reached the target this run
    attempt: number;       // daily only: which attempt this run is (1-based)
    totalChoiceMs: number; // total time spent across every choice this run
    choiceCount: number;   // number of choices made
    rng: () => number;     // round-building randomness (seeded for the daily)
}

// How often we *try* to build a round around an accolade. Accolades rarely
// qualify on their own (most players have 0 of any award, so a random pair ties
// at 0 and the stat is ineligible), but blindly forcing them makes for trivial
// "known value is 0, so the answer is obviously higher" questions. So we keep the
// rate low AND only allow accolade rounds where the shown (left) value is > 0 —
// that makes them real comparisons and self-limits them to decorated players.
const ACCOLADE_RATE = 0.12;

function randItem<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length)];
}

// Try to build a non-trivial accolade round: the known (left) value must be > 0
// and the challenger must differ on that award. Returns null if none turns up.
function tryAccoladeRound(left: Player, rng: () => number): Round | null {
    for (let i = 0; i < 40; i++) {
        const right = randItem(PLAYERS, rng);
        if (right.id === left.id) continue;
        const accolades = eligibleStats(left, right)
            .filter((s) => s.category === 'Accolade' && (s.get(left) ?? 0) > 0);
        if (accolades.length > 0) return { left, right, stat: randItem(accolades, rng) };
    }
    return null;
}

// Pick a fresh challenger (the `right`, hidden player) against the known `left`
// reference, with at least one non-tied stat, and a random eligible stat.
function buildRound(left: Player, rng: () => number): Round {
    if (rng() < ACCOLADE_RATE) {
        const accoladeRound = tryAccoladeRound(left, rng);
        if (accoladeRound) return accoladeRound;
    }
    let right: Player;
    let stats: StatDef[];
    do {
        right = randItem(PLAYERS, rng);
        stats = right.id === left.id ? [] : eligibleStats(left, right);
    } while (stats.length === 0);
    return { left, right, stat: randItem(stats, rng) };
}

export function newGame(mode: Mode = 'unlimited'): GameState {
    // Daily replays the same seeded sequence each day; other modes are random.
    const rng = mode === 'daily' ? seededRng(todayKey()) : Math.random;
    const attempt = mode === 'daily' ? loadDaily().attempts : 0;
    const left = randItem(PLAYERS, rng);
    const best = loadBest(mode);
    return {
        mode,
        round: buildRound(left, rng),
        score: 0,
        best,
        startBest: best,
        over: false,
        won: false,
        attempt,
        totalChoiceMs: 0,
        choiceCount: 0,
        rng,
    };
}

// Returns whether the guess was correct. `higher` = "right has more than left".
// `elapsedMs` is the time the player took to make this choice.
export function guess(state: GameState, higher: boolean, elapsedMs: number): boolean {
    const { left, right, stat } = state.round;
    const lv = stat.get(left)!;
    const rv = stat.get(right)!;
    const correct = higher ? rv > lv : rv < lv;

    state.totalChoiceMs += elapsedMs;
    state.choiceCount += 1;

    if (correct) {
        state.score += 1;
        if (state.score > state.best) {
            state.best = state.score;
            saveBest(state.mode, state.best);
        }
        // Daily: hitting the target beats the day.
        if (state.mode === 'daily' && state.score >= DAILY_TARGET) {
            state.over = true;
            state.won = true;
            recordDailyResult(state, true);
        }
    } else if (state.mode === 'unlimited' || state.mode === 'daily') {
        // A miss ends an unlimited or daily run; in timed mode only the clock does.
        state.over = true;
        if (state.mode === 'daily') recordDailyResult(state, false);
    }
    return correct;
}

// Persist the outcome of a daily attempt: a win locks in the day (keeping the
// attempt number you won on); a loss bumps the attempt count for the next try.
function recordDailyResult(state: GameState, won: boolean): void {
    const rec = loadDaily();
    if (rec.won) return; // day already beaten — don't disturb the record
    if (won) {
        rec.won = true;
        rec.attempts = state.attempt;
    } else {
        rec.attempts = state.attempt + 1;
    }
    saveDaily(rec);
}

// End the run explicitly — used when the timed-mode clock hits zero.
export function endRun(state: GameState): void {
    state.over = true;
}

// Advance after a correct guess: the just-judged `right` becomes the new known
// reference on the left, and a fresh challenger slides in on the right.
export function advance(state: GameState): void {
    state.round = buildRound(state.round.right, state.rng);
}

// Average seconds per choice this run (0 before any choice is made).
export function averageChoiceSeconds(state: GameState): number {
    return state.choiceCount === 0 ? 0 : state.totalChoiceMs / state.choiceCount / 1000;
}

function loadBest(mode: Mode): number {
    const raw = localStorage.getItem(bestKey(mode));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
}

function saveBest(mode: Mode, best: number): void {
    localStorage.setItem(bestKey(mode), String(best));
}
