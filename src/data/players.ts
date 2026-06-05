import type { Player, StatLine } from '../types';
import generated from './players.json';

// -----------------------------------------------------------------------------
// CURATED DATASET (fallback)
//
// Per-game averages and accolades are hand-entered from each player's real
// career line. The counting TOTALS (points, rebounds, minutes, etc.) are
// derived from averages x games-played so they stay internally consistent with
// the per-game numbers; field-goals-made is computed from the scoring identity
//   pts = 2*(fgm - fg3m) + 3*fg3m + ftm   ->   fgm = (pts - ftm - fg3m) / 2
// so only free-throws-made and 3-pointers-made are supplied explicitly.
//
// Active players are listed through roughly the 2023-24 season. `season` (the
// 2025-26 line) is null for everyone for now — wire it up from a live source
// (e.g. balldontlie.io / stats.nba.com) and the Season Average / Season Total
// stat categories light up automatically. The engine already skips season
// stats for any player whose `season` is null.
// -----------------------------------------------------------------------------

type Avg = [number, number, number, number, number, number, number, number, number];
//          ppg    rpg    apg    spg    bpg    fg%    3p%    ft%    mpg
type Acc = [number, number, number, number, number, number, number, number, number, number];
//          mvp   fmvp  rings  AS    allNBA allDef dpoy  score assist reb

function mk(
    id: string, name: string, nbaId: number,
    avg: Avg, gp: number, gs: number, ftm: number, fg3m: number, acc: Acc,
): Player {
    const [ppg, rpg, apg, spg, bpg, fgPct, fg3Pct, ftPct, mpg] = avg;
    const pts = Math.round(ppg * gp);
    const fgm = Math.round((pts - ftm - fg3m) / 2);
    const career: StatLine = {
        ppg, rpg, apg, spg, bpg, fgPct, fg3Pct, ftPct, mpg,
        pts,
        reb: Math.round(rpg * gp),
        ast: Math.round(apg * gp),
        stl: Math.round(spg * gp),
        blk: Math.round(bpg * gp),
        fg3m, ftm, fgm, gp, gs,
        min: Math.round(mpg * gp),
    };
    const [mvp, finalsMvp, championships, allStar, allNba, allDefensive, dpoy, scoringTitles, assistTitles, reboundTitles] = acc;
    return {
        id, name, nbaId, career, season: null,
        accolades: { mvp, finalsMvp, championships, allStar, allNba, allDefensive, dpoy, scoringTitles, assistTitles, reboundTitles },
    };
}

const CURATED: Player[] = [
    mk('jordan', 'Michael Jordan', 893,
        [30.1, 6.2, 5.3, 2.3, 0.8, 49.7, 32.7, 83.5, 38.3], 1072, 1039, 7327, 581,
        [5, 6, 6, 14, 11, 9, 1, 10, 0, 0]),
    mk('lebron', 'LeBron James', 2544,
        [27.1, 7.5, 7.4, 1.5, 0.7, 50.5, 34.8, 73.5, 38.1], 1492, 1491, 8425, 2475,
        [4, 4, 4, 20, 20, 6, 0, 1, 1, 0]),
    mk('kareem', 'Kareem Abdul-Jabbar', 76003,
        [24.6, 11.2, 3.6, 0.9, 2.6, 55.9, 5.6, 72.1, 36.8], 1560, 1547, 6712, 1,
        [6, 2, 6, 19, 15, 11, 0, 2, 0, 1]),
    mk('magic', 'Magic Johnson', 77142,
        [19.5, 7.2, 11.2, 1.9, 0.4, 52.0, 30.3, 84.8, 36.7], 906, 871, 5850, 155,
        [3, 3, 5, 12, 10, 0, 0, 0, 4, 0]),
    mk('bird', 'Larry Bird', 1449,
        [24.3, 10.0, 6.3, 1.7, 0.8, 49.6, 37.6, 88.6, 38.4], 897, 895, 3960, 649,
        [3, 2, 3, 12, 10, 3, 0, 0, 0, 0]),
    mk('kobe', 'Kobe Bryant', 977,
        [25.0, 5.2, 4.7, 1.4, 0.5, 44.7, 32.9, 83.7, 36.1], 1346, 1198, 8378, 1827,
        [1, 2, 5, 18, 15, 12, 0, 2, 0, 0]),
    mk('shaq', "Shaquille O'Neal", 406,
        [23.7, 10.9, 2.5, 0.6, 2.3, 58.2, 4.5, 52.7, 34.7], 1207, 1197, 5935, 1,
        [1, 3, 4, 15, 14, 0, 0, 2, 0, 0]),
    mk('duncan', 'Tim Duncan', 1495,
        [19.0, 10.8, 3.0, 0.7, 2.2, 50.6, 17.9, 69.6, 34.0], 1392, 1382, 5366, 22,
        [2, 3, 5, 15, 15, 15, 0, 0, 0, 0]),
    mk('hakeem', 'Hakeem Olajuwon', 165,
        [21.8, 11.1, 2.5, 1.7, 3.1, 51.2, 20.2, 71.2, 35.7], 1238, 1186, 6093, 25,
        [1, 2, 2, 12, 12, 9, 2, 0, 0, 2]),
    mk('wilt', 'Wilt Chamberlain', 76375,
        [30.1, 22.9, 4.4, 0.0, 0.0, 54.0, 0.0, 51.1, 45.8], 1045, 1045, 6057, 0,
        [4, 1, 2, 13, 10, 2, 0, 7, 1, 11]),
    mk('russell', 'Bill Russell', 78049,
        [15.1, 22.5, 4.3, 0.0, 0.0, 44.0, 0.0, 56.1, 42.3], 963, 963, 4001, 0,
        [5, 0, 11, 12, 11, 1, 0, 0, 0, 4]),
    mk('garnett', 'Kevin Garnett', 708,
        [17.8, 10.0, 3.7, 1.3, 1.4, 49.7, 27.5, 78.9, 34.4], 1462, 1424, 4855, 172,
        [1, 0, 1, 15, 9, 12, 1, 0, 0, 4]),
    mk('dirk', 'Dirk Nowitzki', 1717,
        [20.7, 7.5, 2.4, 0.8, 0.8, 47.1, 38.0, 87.9, 34.3], 1522, 1474, 7240, 1982,
        [1, 1, 1, 14, 12, 0, 0, 0, 0, 0]),
    mk('iverson', 'Allen Iverson', 947,
        [26.7, 3.7, 6.2, 2.2, 0.2, 42.5, 31.3, 78.0, 41.1], 914, 901, 5077, 885,
        [1, 0, 0, 11, 7, 0, 0, 4, 0, 0]),
    mk('stockton', 'John Stockton', 304,
        [13.1, 2.7, 10.5, 2.2, 0.2, 51.5, 38.4, 82.6, 31.8], 1504, 1300, 4788, 845,
        [0, 0, 0, 10, 11, 5, 0, 0, 9, 0]),
    mk('malone', 'Karl Malone', 252,
        [25.0, 10.1, 3.6, 1.4, 0.8, 51.6, 27.4, 74.2, 37.2], 1476, 1471, 9787, 85,
        [2, 0, 0, 14, 14, 4, 0, 0, 0, 0]),
    mk('barkley', 'Charles Barkley', 787,
        [22.1, 11.7, 3.9, 1.5, 0.8, 54.1, 26.6, 73.5, 36.7], 1073, 1012, 6349, 538,
        [1, 0, 0, 11, 11, 0, 0, 0, 0, 1]),
    mk('curry', 'Stephen Curry', 201939,
        [24.8, 4.7, 6.4, 1.5, 0.2, 47.3, 42.7, 91.0, 34.4], 956, 866, 3117, 3747,
        [2, 1, 4, 10, 10, 0, 0, 2, 0, 0]),
    mk('durant', 'Kevin Durant', 201142,
        [27.3, 7.1, 4.4, 1.1, 1.1, 50.1, 38.8, 88.5, 37.0], 1077, 1064, 6447, 1988,
        [1, 2, 2, 14, 11, 0, 0, 4, 0, 0]),
    mk('giannis', 'Giannis Antetokounmpo', 203507,
        [23.0, 9.6, 4.8, 1.1, 1.2, 54.0, 28.7, 71.0, 32.8], 870, 820, 4200, 620,
        [2, 1, 1, 8, 8, 6, 1, 0, 0, 0]),
    mk('jokic', 'Nikola Jokic', 203999,
        [21.0, 10.7, 6.9, 1.3, 0.7, 55.6, 35.0, 83.0, 32.0], 660, 640, 2400, 720,
        [3, 1, 1, 6, 6, 0, 0, 0, 0, 0]),
    mk('embiid', 'Joel Embiid', 203954,
        [27.9, 11.2, 3.7, 0.9, 1.7, 50.0, 33.9, 81.4, 33.0], 452, 440, 3300, 480,
        [1, 0, 0, 7, 5, 0, 0, 2, 0, 0]),
    mk('westbrook', 'Russell Westbrook', 201566,
        [21.3, 7.0, 8.3, 1.6, 0.3, 43.8, 30.5, 78.0, 33.9], 1100, 1050, 5400, 1300,
        [1, 0, 0, 9, 9, 0, 0, 2, 3, 0]),
    mk('harden', 'James Harden', 201935,
        [24.0, 5.6, 7.0, 1.5, 0.5, 44.2, 36.2, 86.0, 34.3], 1000, 900, 6800, 2800,
        [1, 0, 0, 11, 7, 0, 0, 3, 2, 0]),
    mk('paul', 'Chris Paul', 101108,
        [17.9, 4.5, 9.4, 2.1, 0.1, 47.1, 36.8, 87.0, 33.0], 1300, 1290, 3800, 1900,
        [0, 0, 0, 12, 11, 9, 0, 0, 4, 0]),
    mk('tatum', 'Jayson Tatum', 1628369,
        [23.0, 7.0, 3.5, 1.0, 0.6, 45.5, 37.0, 85.0, 35.0], 550, 540, 2600, 1500,
        [0, 0, 1, 5, 5, 0, 0, 0, 0, 0]),
    mk('doncic', 'Luka Doncic', 1629029,
        [28.6, 8.7, 8.3, 1.2, 0.4, 47.0, 34.5, 74.5, 36.0], 430, 430, 2900, 1300,
        [0, 0, 0, 5, 5, 0, 0, 1, 0, 0]),
];

// Players permanently excluded from the game (by NBA person id). Kept out of
// every mode regardless of what's in players.json.
const EXCLUDED_NBA_IDS = new Set<number>([
    1629634, // Brandon Clarke — excluded out of respect.
]);

// Prefer real data fetched from stats.nba.com (run `npm run fetch`); fall back
// to the hand-curated set above when players.json hasn't been generated yet.
export const PLAYERS: Player[] = ((generated as Player[]).length > 0
    ? (generated as Player[])
    : CURATED
).filter((p) => p.nbaId === undefined || !EXCLUDED_NBA_IDS.has(p.nbaId));
