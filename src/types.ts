// A line of box-score numbers — used for both career and the 2025-26 season.
// Per-game fields are averages; the rest are running totals.
export interface StatLine {
    // averages
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    fgPct: number;   // stored as a percentage, e.g. 49.7
    fg3Pct: number;
    ftPct: number;
    mpg: number;
    // totals
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    fg3m: number;
    ftm: number;
    fgm: number;
    gp: number;
    gs: number;
    min: number;
}

export interface Accolades {
    mvp: number;
    finalsMvp: number;
    championships: number;
    allStar: number;
    allNba: number;
    allDefensive: number;
    dpoy: number;
    scoringTitles: number;
    assistTitles: number;
    reboundTitles: number;
}

export interface Player {
    id: string;
    name: string;
    nbaId?: number;            // NBA.com person id, used for the headshot
    team?: string;             // current team abbreviation, e.g. "LAL"
    position?: string;         // e.g. "Forward", "Guard-Forward"
    careerFrom?: number;       // first season's starting year, e.g. 2003 (-> 2003-04)
    careerTo?: number;         // last season's starting year, e.g. 2025 (-> 2025-26)
    career: StatLine;
    season: StatLine | null;   // 2025-26; null for players who didn't play this season
    accolades: Accolades;
}

export type StatCategory =
    | 'Career Average'
    | 'Season Average'
    | 'Career Total'
    | 'Season Total'
    | 'Accolade';

export interface StatDef {
    id: string;
    label: string;
    color: string;          // color unique to this metric (e.g. Points Per Game)
    category: StatCategory;  // internal key (drives the category color)
    categoryLabel: string;   // what's shown to the player (e.g. "Career", "Season (25-26)")
    categoryColor: string;  // color unique to the category (e.g. Career Average)
    get: (p: Player) => number | null;
    format: (v: number) => string;
}
