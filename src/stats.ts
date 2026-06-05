import type { Player, StatDef, StatLine, Accolades, StatCategory } from './types';

// ---- formatters -------------------------------------------------------------

const fmtDec = (v: number): string => v.toFixed(1);
const fmtPct = (v: number): string => `${v.toFixed(1)}%`;
const fmtInt = (v: number): string => Math.round(v).toLocaleString('en-US');

// ---- category colors --------------------------------------------------------

export const CATEGORY_COLORS: Record<StatCategory, string> = {
    // Career (avg + total) share one vivid color, 25-26 Season share another,
    // so each displayed label pops as a single consistent color.
    'Career Average': '#33b5ff', // electric blue
    'Career Total': '#33b5ff',
    'Season Average': '#2bff86', // neon green
    'Season Total': '#2bff86',
    'Accolade': '#ffd21a',       // bright gold
};

// Shown to the player. The stat name already says "Total"/"Per Game", so the
// category just needs to say when: career, or this specific season.
const CATEGORY_LABELS: Record<StatCategory, string> = {
    'Career Average': 'Career',
    'Season Average': '25-26 Season',
    'Career Total': 'Career',
    'Season Total': '25-26 Season',
    'Accolade': 'Accolade',
};

// ---- stat metadata (each metric carries its own color) ----------------------

type AvgKey = Extract<keyof StatLine, 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fgPct' | 'fg3Pct' | 'ftPct' | 'mpg'>;
type TotalKey = Extract<keyof StatLine, 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg3m' | 'ftm' | 'fgm' | 'gp' | 'gs' | 'min'>;

const AVG_STATS: { key: AvgKey; label: string; pct: boolean; color: string }[] = [
    { key: 'ppg', label: 'Points Per Game', pct: false, color: '#ff5252' },
    { key: 'rpg', label: 'Rebounds Per Game', pct: false, color: '#2ee6d6' },
    { key: 'apg', label: 'Assists Per Game', pct: false, color: '#ffe23d' },
    { key: 'spg', label: 'Steals Per Game', pct: false, color: '#3df06f' },
    { key: 'bpg', label: 'Blocks Per Game', pct: false, color: '#4d9bff' },
    { key: 'fgPct', label: 'Field Goal %', pct: true, color: '#d56bff' },
    { key: 'fg3Pct', label: '3-Point %', pct: true, color: '#ff9326' },
    { key: 'ftPct', label: 'Free Throw %', pct: true, color: '#ff79c6' },
    { key: 'mpg', label: 'Minutes Per Game', pct: false, color: '#9a8bff' },
];

const TOTAL_STATS: { key: TotalKey; label: string; color: string }[] = [
    { key: 'pts', label: 'Total Points', color: '#ff5252' },
    { key: 'reb', label: 'Total Rebounds', color: '#2ee6d6' },
    { key: 'ast', label: 'Total Assists', color: '#ffe23d' },
    { key: 'stl', label: 'Total Steals', color: '#3df06f' },
    { key: 'blk', label: 'Total Blocks', color: '#4d9bff' },
    { key: 'fg3m', label: 'Total 3-Pointers Made', color: '#ff9326' },
    { key: 'ftm', label: 'Total Free Throws Made', color: '#ff79c6' },
    { key: 'fgm', label: 'Total Field Goals Made', color: '#d56bff' },
    { key: 'gp', label: 'Games Played', color: '#4dffb0' },
    { key: 'gs', label: 'Games Started', color: '#b78bff' },
    { key: 'min', label: 'Total Minutes Played', color: '#9a8bff' },
];

const ACCOLADE_STATS: { key: keyof Accolades; label: string; color: string }[] = [
    { key: 'mvp', label: 'MVP Awards', color: '#ffd700' },
    { key: 'finalsMvp', label: 'Finals MVP Awards', color: '#ff9a3d' },
    { key: 'championships', label: 'Championships', color: '#ff5a5a' },
    { key: 'allStar', label: 'All-Star Selections', color: '#45c8ff' },
    { key: 'allNba', label: 'All-NBA Selections', color: '#9466ff' },
    { key: 'allDefensive', label: 'All-Defensive Selections', color: '#1ce0c0' },
    { key: 'dpoy', label: 'Defensive Player of the Year Awards', color: '#7bf032' },
    { key: 'scoringTitles', label: 'Scoring Titles', color: '#ff4f93' },
    { key: 'assistTitles', label: 'Assist Titles', color: '#2bffff' },
    { key: 'reboundTitles', label: 'Rebound Titles', color: '#ffb84d' },
];

// ---- catalog: 9+9 averages, 11+11 totals, 10 accolades = 50 stats -----------

function buildCatalog(): StatDef[] {
    const cat: StatDef[] = [];

    for (const s of AVG_STATS) {
        const format = s.pct ? fmtPct : fmtDec;
        cat.push({
            id: `career_${s.key}`, label: s.label, color: s.color,
            category: 'Career Average', categoryLabel: CATEGORY_LABELS['Career Average'],
            categoryColor: CATEGORY_COLORS['Career Average'],
            get: (p) => p.career[s.key], format,
        });
        cat.push({
            id: `season_${s.key}`, label: s.label, color: s.color,
            category: 'Season Average', categoryLabel: CATEGORY_LABELS['Season Average'],
            categoryColor: CATEGORY_COLORS['Season Average'],
            get: (p) => (p.season ? p.season[s.key] : null), format,
        });
    }

    for (const s of TOTAL_STATS) {
        cat.push({
            id: `careerTot_${s.key}`, label: s.label, color: s.color,
            category: 'Career Total', categoryLabel: CATEGORY_LABELS['Career Total'],
            categoryColor: CATEGORY_COLORS['Career Total'],
            get: (p) => p.career[s.key], format: fmtInt,
        });
        cat.push({
            id: `seasonTot_${s.key}`, label: s.label, color: s.color,
            category: 'Season Total', categoryLabel: CATEGORY_LABELS['Season Total'],
            categoryColor: CATEGORY_COLORS['Season Total'],
            get: (p) => (p.season ? p.season[s.key] : null), format: fmtInt,
        });
    }

    for (const s of ACCOLADE_STATS) {
        cat.push({
            id: `acc_${s.key}`, label: s.label, color: s.color,
            category: 'Accolade', categoryLabel: CATEGORY_LABELS['Accolade'],
            categoryColor: CATEGORY_COLORS['Accolade'],
            get: (p) => p.accolades[s.key], format: fmtInt,
        });
    }

    return cat;
}

export const STAT_CATALOG: StatDef[] = buildCatalog();

// A stat is usable for a matchup only if both players have the value AND the
// two values differ — equal values can't be a fair higher/lower question.
export function eligibleStats(a: Player, b: Player): StatDef[] {
    return STAT_CATALOG.filter((stat) => {
        const av = stat.get(a);
        const bv = stat.get(b);
        return av !== null && bv !== null && av !== bv;
    });
}
