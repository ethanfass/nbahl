import type { Player, StatDef } from './types';
import type { GameState, Mode } from './game';
import { averageChoiceSeconds, DAILY_TARGET, loadDaily } from './game';

export interface Callbacks {
    onGuess: (higher: boolean) => void;
    onRestart: () => void;
    onShare: () => void;
    onSelectMode: (mode: Mode) => void;
}

// view phases the UI can render
export type View =
    | { phase: 'play'; state: GameState }
    | { phase: 'reveal'; state: GameState; higher: boolean; correct: boolean }
    | { phase: 'over'; state: GameState }; // run ended without an active reveal (e.g. timer ran out)

const AVATAR_COLORS = ['#c9402f', '#2f6dc9', '#2fae6a', '#9b51e0', '#d98e1f', '#1f9bd9'];

function initialsAvatar(name: string): string {
    const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="110">` +
        `<rect width="150" height="110" fill="${color}"/>` +
        `<text x="75" y="68" font-size="44" font-family="sans-serif" font-weight="700" ` +
        `fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function headshotUrl(p: Player): string {
    return p.nbaId
        ? `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.nbaId}.png`
        : initialsAvatar(p.name);
}

function escape(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// A vivid, distinct color per listed position so they read at a glance.
const POSITION_COLORS: Record<string, string> = {
    'G': '#3fa9ff',   // guard — electric blue
    'F': '#2be08b',   // forward — green
    'C': '#ff8a3d',   // center — orange
    'G-F': '#2bd4c4', // aqua
    'F-G': '#a6e22e', // lime
    'C-F': '#ff5ca8', // pink
    'F-C': '#b25cff', // purple
};

// Each team's signature color, brightened where the real hue is too dark to
// read over the headshot. Keyed by the abbreviation stored on the player.
const TEAM_COLORS: Record<string, string> = {
    ATL: '#e8434b', BKN: '#cdd2d9', BOS: '#1bb463', CHA: '#2db5c6', CHI: '#e8434b',
    CLE: '#c24e6e', DAL: '#3a8de0', DEN: '#f4b940', DET: '#e85a6a', GSW: '#fdb927',
    HOU: '#e8434b', IND: '#f4c84a', LAC: '#e85a6a', LAL: '#b25cff', MEM: '#5aa7e0',
    MIA: '#e8466e', MIL: '#2cb46b', MIN: '#4e9fe0', NOP: '#caa257', NYK: '#f58426',
    OKC: '#3a9fe0', ORL: '#3a8de0', PHI: '#3a8de0', PHX: '#c46cff', POR: '#e8434b',
    SAC: '#9e5cff', SAS: '#cdd2d9', TOR: '#e8434b', UTA: '#f4c84a', WAS: '#3a8de0',
};

// "F · LAL" under the player's name (whichever pieces we have), with the
// position and team each tinted their own color for a bit of pop / context.
function metaLine(p: Player): string {
    const bits: string[] = [];
    if (p.position) {
        const c = POSITION_COLORS[p.position] ?? '#ffffff';
        bits.push(`<span class="pos" style="color:${c}">${escape(p.position)}</span>`);
    }
    if (p.team) {
        const c = TEAM_COLORS[p.team] ?? '#ffffff';
        bits.push(`<span class="team" style="color:${c}">${escape(p.team)}</span>`);
    }
    return bits.length ? `<div class="meta">${bits.join('<span class="dot"> · </span>')}</div>` : '';
}

// 2003 -> "03-04"
function seasonLabel(year: number): string {
    return `${String(year % 100).padStart(2, '0')}-${String((year + 1) % 100).padStart(2, '0')}`;
}

// "03-04 – 25-26", or null if we don't have the years.
function careerSpan(p: Player): string | null {
    if (!p.careerFrom || !p.careerTo) return null;
    return `${seasonLabel(p.careerFrom)} – ${seasonLabel(p.careerTo)}`;
}

function isCareerStat(stat: StatDef): boolean {
    return stat.category === 'Career Average' || stat.category === 'Career Total';
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

// Rough perceptual distance between two hex colors.
function colorDistance(a: string, b: string): number {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

// The category as a colored pill, with the metric name (in its own color) below.
// If the metric color is too close to the category color, fall back to white so
// the two never read as the same color. `suffix` appends "than <player>", and
// `years` (the career span) sits right under the "Career" pill when present.
function statLabelHtml(stat: StatDef, suffix = '', years: string | null = null): string {
    const metricColor = colorDistance(stat.color, stat.categoryColor) < 90 ? '#ffffff' : stat.color;
    const pill = `<span class="cat" style="--cat:${stat.categoryColor}">${stat.categoryLabel}</span>`;
    const cat = years
        ? `<span class="cat-wrap">${pill}<span class="span">${years}</span></span>`
        : pill;
    return cat +
        `<span class="stat-name" style="color:${metricColor}">${stat.label}${suffix}</span>`;
}

export class UI {
    private root: HTMLElement;
    private cb: Callbacks;
    private countUpRaf: number | undefined; // active count-up animation frame, if any

    constructor(root: HTMLElement, cb: Callbacks) {
        this.root = root;
        this.cb = cb;
    }

    render(view: View): void {
        const { state } = view;
        const { left, right, stat } = state.round;

        const revealed = view.phase === 'reveal';
        const lv = stat.get(left)!;
        const rv = stat.get(right)!;

        // streak color: red under the record, white when tied, green when over it
        const streakState = state.score > state.startBest ? 'over'
            : state.score === state.startBest ? 'tied' : 'under';

        // right is the hidden/guessed side; it reveals green or red on answer
        const rightValueClass = revealed
            ? (view.correct ? 'reveal-green' : 'reveal-red')
            : 'hidden';
        const rightValueText = revealed ? stat.format(rv) : '?';

        // result feedback applied to the mystery (right) panel on reveal
        const rightResultClass = revealed ? (view.correct ? 'correct' : 'wrong') : '';
        const resultBadge = revealed
            ? `<div class="result-badge ${view.correct ? 'good' : 'bad'}">${view.correct ? '✓' : '✗'}</div>`
            : '';

        // career year span — shown under both players for context (career-stat rounds)
        const career = isCareerStat(stat);
        const leftSpan = career ? careerSpan(left) : null;
        const rightSpan = career ? careerSpan(right) : null;

        const mode = state.mode;

        this.root.innerHTML = `
            <div class="topbar">
                <div class="title"><span class="hi">Higher</span> or <span class="lo">Lower</span> x <span class="nn">N</span><span class="nb">B</span><span class="na">A</span></div>
                <div class="modes" role="tablist">
                    <button class="mode-btn ${mode === 'unlimited' ? 'active' : ''}" data-mode="unlimited">Unlimited</button>
                    <button class="mode-btn ${mode === 'timed' ? 'active' : ''}" data-mode="timed">1 Min</button>
                    <button class="mode-btn ${mode === 'daily' ? 'active' : ''}" data-mode="daily">Daily</button>
                </div>
                <div class="scores">
                    <div class="score-box"><div class="label">Time</div><div class="val timer" data-timer>--</div></div>
                    ${this.scoreBoxesHtml(state, streakState)}
                </div>
            </div>
            ${this.dailyStatusHtml(state)}
            <div class="stage">
                <div class="arena">
                    <div class="panel left">
                        <img class="panel-bg" alt="${escape(left.name)}" src="${headshotUrl(left)}" />
                        <div class="panel-overlay"></div>
                        <div class="panel-inner ${view.phase === 'play' ? 'intro' : ''}">
                            <div class="pi-head">
                                <div class="pname">${escape(left.name)}</div>
                                ${metaLine(left)}
                                <div class="has">has</div>
                            </div>
                            <div class="answer-slot">
                                <div class="stat-value" style="color:${stat.color}">${stat.format(lv)}</div>
                            </div>
                            <div class="pi-foot">
                                <div class="stat-label">${statLabelHtml(stat, '', leftSpan)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="vs-badge">VS</div>
                    <div class="panel right ${rightResultClass}">
                        <img class="panel-bg" alt="${escape(right.name)}" src="${headshotUrl(right)}" />
                        <div class="panel-overlay"></div>
                        ${resultBadge}
                        <div class="panel-inner ${view.phase === 'play' ? 'intro' : ''}">
                            <div class="pi-head">
                                <div class="pname">${escape(right.name)}</div>
                                ${metaLine(right)}
                                <div class="has">has</div>
                            </div>
                            <div class="answer-slot">
                                ${this.rightMiddleHtml(view, rightValueClass, rightValueText)}
                            </div>
                            <div class="pi-foot">
                                <div class="stat-label">${statLabelHtml(stat, `<span class="than">than <span class="than-name">${escape(left.name)}</span></span>`, rightSpan)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                ${(view.phase === 'over' || state.over) ? `<div class="overlay">${this.gameOverHtml(state)}</div>` : ''}
            </div>
        `;

        this.attachImageFallbacks();
        this.attachHandlers(view);

        // On reveal, count the mystery value up from zero for a bit of arcade flair.
        if (revealed) this.animateCountUp(stat, rv);
    }

    // Tween the right panel's stat value from 0 to its real number, formatting
    // each frame with the stat's own formatter (handles decimals / % / big ints).
    private animateCountUp(stat: StatDef, to: number): void {
        const el = this.root.querySelector<HTMLElement>('.panel.right .stat-value');
        if (!el) return;
        if (this.countUpRaf !== undefined) cancelAnimationFrame(this.countUpRaf);

        const durationMs = 600;
        const start = performance.now();
        el.textContent = stat.format(0); // paint the starting frame before the first tick
        const step = (now: number): void => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
            el.textContent = stat.format(to * eased);
            if (t < 1) {
                this.countUpRaf = requestAnimationFrame(step);
            } else {
                el.textContent = stat.format(to); // land exactly on the real value
                this.countUpRaf = undefined;
            }
        };
        this.countUpRaf = requestAnimationFrame(step);
    }

    // The middle of the unknown (right) panel: the guess buttons while playing,
    // the revealed value on reveal, or a hidden "?" once the run is over.
    private rightMiddleHtml(view: View, valueClass: string, valueText: string): string {
        if (view.phase === 'play') {
            return `
                <div class="guess-stack">
                    <button class="gbtn higher" data-act="higher"><span class="lbl">Higher</span><span class="arrow">▲</span></button>
                    <button class="gbtn lower" data-act="lower"><span class="lbl">Lower</span><span class="arrow">▼</span></button>
                </div>`;
        }
        if (view.phase === 'reveal') {
            return `<div class="stat-value ${valueClass}">${valueText}</div>`;
        }
        return `<div class="stat-value hidden">?</div>`;
    }

    // Daily-only banner stating whether today's daily has been beaten yet.
    private dailyStatusHtml(state: GameState): string {
        if (state.mode !== 'daily') return '';
        const done = state.won || loadDaily().won;
        return `<div class="daily-status ${done ? 'done' : 'todo'}">${
            done ? "★ Today's daily — Completed" : "Today's daily — Not completed yet"
        }</div>`;
    }

    // Right-side scoreboard, which differs for the daily (score-to-target + attempts).
    private scoreBoxesHtml(state: GameState, streakState: string): string {
        if (state.mode === 'daily') {
            return `
                <div class="score-box"><div class="label">Score</div><div class="val score-daily">${state.score}/${DAILY_TARGET}</div></div>
                <div class="score-box"><div class="label">Attempt</div><div class="val attempt">${state.attempt}</div></div>`;
        }
        return `
            <div class="score-box"><div class="label">Streak</div><div class="val streak streak-${streakState}">${state.score}</div></div>
            <div class="score-box"><div class="label">Best</div><div class="val best">${state.best}</div></div>`;
    }

    // Game-over panel — shared by an unlimited miss and a timed clock-out.
    private gameOverHtml(state: GameState): string {
        const avg = averageChoiceSeconds(state).toFixed(1);

        if (state.mode === 'daily') {
            const won = state.won;
            return `
                <div class="gameover">
                    <div class="banner ${won ? 'ok' : 'bad'}">${won ? 'Daily Beat!' : 'Failed!'}</div>
                    <div class="go-title ${won ? 'win' : ''}">${won ? `Beat it on attempt ${state.attempt}` : `Attempt ${state.attempt} failed`}</div>
                    <div class="go-stats">
                        <div class="go-stat"><div class="go-stat-label">Score</div><div class="go-stat-val">${state.score}/${DAILY_TARGET}</div></div>
                        <div class="go-stat"><div class="go-stat-label">Attempt</div><div class="go-stat-val">${state.attempt}</div></div>
                        <div class="go-stat"><div class="go-stat-label">Avg / Pick</div><div class="go-stat-val">${avg}s</div></div>
                    </div>
                    <div class="go-actions">
                        <button class="btn primary" data-act="restart">${won ? 'Play again' : 'Try again'}</button>
                        <button class="btn share" data-act="share">Share</button>
                    </div>
                </div>`;
        }

        const banner = state.mode === 'timed' ? "Time's up!" : 'Wrong!';
        const scoreLabel = state.mode === 'timed' ? 'Finished' : 'Score';
        return `
            <div class="gameover">
                <div class="banner bad">${banner}</div>
                <div class="go-title">Game Over</div>
                <div class="go-stats">
                    <div class="go-stat"><div class="go-stat-label">${scoreLabel}</div><div class="go-stat-val">${state.score}</div></div>
                    <div class="go-stat"><div class="go-stat-label">Best</div><div class="go-stat-val best">${state.best}</div></div>
                    <div class="go-stat"><div class="go-stat-label">Avg / Pick</div><div class="go-stat-val">${avg}s</div></div>
                </div>
                <div class="go-actions">
                    <button class="btn primary" data-act="restart">Play again</button>
                    <button class="btn share" data-act="share">Share</button>
                </div>
            </div>`;
    }

    private attachHandlers(view: View): void {
        const root = this.root;

        // Mode selector is always live so the player can switch at any time.
        root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
            btn.addEventListener('click', () => this.cb.onSelectMode(btn.dataset.mode as Mode));
        });

        if (view.phase === 'play') {
            root.querySelector('[data-act="higher"]')?.addEventListener('click', () => this.cb.onGuess(true));
            root.querySelector('[data-act="lower"]')?.addEventListener('click', () => this.cb.onGuess(false));
        } else if (view.phase === 'over' || view.state.over) {
            root.querySelector('[data-act="restart"]')?.addEventListener('click', () => this.cb.onRestart());
            root.querySelector('[data-act="share"]')?.addEventListener('click', () => this.cb.onShare());
        }
    }

    // Update just the clock readout without a full re-render.
    setTimer(text: string, danger = false): void {
        const el = this.root.querySelector<HTMLElement>('[data-timer]');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('danger', danger);
    }

    // Briefly relabel the Share button to confirm a clipboard copy succeeded.
    flashShared(): void {
        const btn = this.root.querySelector<HTMLButtonElement>('[data-act="share"]');
        if (!btn) return;
        btn.textContent = 'Copied!';
        window.setTimeout(() => {
            if (btn.isConnected) btn.textContent = 'Share';
        }, 1500);
    }

    private attachImageFallbacks(): void {
        this.root.querySelectorAll<HTMLImageElement>('img.panel-bg').forEach((img) => {
            img.addEventListener('error', () => {
                img.src = initialsAvatar(img.alt);
            }, { once: true });
        });
    }
}
