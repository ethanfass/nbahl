import { newGame, guess, advance, endRun, averageChoiceSeconds, TIMED_SECONDS, DAILY_TARGET, todayKey } from './game';
import type { GameState, Mode } from './game';
import { UI } from './ui';
import type { View } from './ui';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

let state: GameState = newGame('unlimited');
let locked = false; // ignore input during the reveal animation
let choiceShownAt = performance.now(); // when the current choice was presented

// ---- run clock ----
// Unlimited counts up (how long you've survived); timed counts down from a minute.
// The clock doesn't move until the player commits to their first answer.
let runStart = performance.now();
let endElapsedMs: number | null = null; // frozen elapsed once the run is over
let clockStarted = false;               // false until the first guess
let clockId: number | undefined;

const ui = new UI(root, {
    onGuess: handleGuess,
    onRestart: handleRestart,
    onShare: handleShare,
    onSelectMode: handleSelectMode,
});

function show(view: View): void {
    ui.render(view);
    paintClock(); // render() rebuilt the topbar, so repaint the clock immediately
}

function elapsedMs(): number {
    if (endElapsedMs !== null) return endElapsedMs;
    if (!clockStarted) return 0; // hasn't started ticking yet
    return performance.now() - runStart;
}

function formatClock(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function paintClock(): void {
    if (state.mode === 'timed') {
        const remainingSec = Math.max(0, Math.ceil((TIMED_SECONDS * 1000 - elapsedMs()) / 1000));
        ui.setTimer(formatClock(remainingSec), remainingSec <= 10);
    } else {
        ui.setTimer(formatClock(Math.floor(elapsedMs() / 1000)));
    }
}

function startClock(): void {
    stopClock();
    runStart = performance.now();
    endElapsedMs = null;
    clockStarted = true;
    clockId = window.setInterval(tick, 100);
    paintClock();
}

function stopClock(): void {
    if (clockId !== undefined) {
        window.clearInterval(clockId);
        clockId = undefined;
    }
}

function tick(): void {
    if (state.mode === 'timed' && elapsedMs() >= TIMED_SECONDS * 1000) {
        timeUp();
        return;
    }
    paintClock();
}

// Freeze the clock and remember where it stopped (so the readout holds its value).
function freezeClock(finalMs: number): void {
    endElapsedMs = finalMs;
    stopClock();
}

function timeUp(): void {
    freezeClock(TIMED_SECONDS * 1000);
    endRun(state);
    locked = true;
    show({ phase: 'over', state });
}

function handleGuess(higher: boolean): void {
    if (locked || state.over) return;
    locked = true;

    if (!clockStarted) startClock(); // the timer begins on the very first choice

    const elapsedSinceShown = performance.now() - choiceShownAt;
    const correct = guess(state, higher, elapsedSinceShown);

    // Unlimited miss ends the run right here — freeze the clock before rendering.
    if (state.over) {
        freezeClock(elapsedMs());
        show({ phase: 'reveal', state, higher, correct });
        return;
    }

    show({ phase: 'reveal', state, higher, correct });

    // Otherwise (correct, or a miss in timed mode) reveal briefly, then continue.
    const revealDelay = state.mode === 'timed' ? 700 : 1400;
    window.setTimeout(() => {
        if (state.over) return; // the clock may have run out during the reveal
        advance(state);
        locked = false;
        choiceShownAt = performance.now();
        show({ phase: 'play', state });
    }, revealDelay);
}

function handleRestart(): void {
    startRun(state.mode);
}

function handleSelectMode(mode: Mode): void {
    if (mode === state.mode && !state.over) return; // already playing this mode
    startRun(mode);
}

function startRun(mode: Mode): void {
    state = newGame(mode);
    locked = false;
    choiceShownAt = performance.now();
    // Reset the clock to its idle starting value; it won't tick until the first guess.
    stopClock();
    clockStarted = false;
    endElapsedMs = null;
    show({ phase: 'play', state });
}

async function handleShare(): Promise<void> {
    const avg = averageChoiceSeconds(state).toFixed(1);
    let text: string;
    if (state.mode === 'daily') {
        const clock = formatClock(Math.floor(elapsedMs() / 1000));
        const line = state.won
            ? `✅ Beat it on attempt ${state.attempt} in ${clock}`
            : `❌ ${state.score}/${DAILY_TARGET} on attempt ${state.attempt}`;
        text =
            `Higher or Lower: NBA 🏀 — Daily ${todayKey()}\n` +
            `${line}\n` +
            `Can you beat it? ${location.href}`;
    } else {
        const modeLabel = state.mode === 'timed' ? '1-minute' : 'unlimited';
        text =
            `Higher or Lower: NBA 🏀\n` +
            `${state.score} correct (${modeLabel}) · ${avg}s avg per pick\n` +
            `Can you beat it? ${location.href}`;
    }
    try {
        if (navigator.share) {
            await navigator.share({ title: 'Higher or Lower: NBA', text });
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            ui.flashShared();
        }
    } catch {
        // user dismissed the share sheet, or share/clipboard was blocked — ignore
    }
}

startRun('unlimited');
