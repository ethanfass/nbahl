// Fetches real NBA data from stats.nba.com and writes src/data/players.json.
//
//   node scripts/fetch-players.mjs        (or: npm run fetch)
//
// Run this on YOUR machine — stats.nba.com is unofficial and tends to block
// datacenter/cloud IPs, but works fine from a residential connection. It is
// slow on purpose (a pause between calls) to avoid being rate-limited, and it
// saves progress periodically so a mid-run block still leaves usable data.
//
// Roster: every player who logged at least 1 game AND 1 minute in the 2025-26
// season, enumerated from leaguedashplayerstats (no manual roster list).
//
// Per player:
//   playercareerstats -> career totals + the 2025-26 season line (per-game is
//                        derived from totals / games-played).
//   playerawards      -> MVP, Finals MVP, All-Star, All-NBA, All-Defensive, DPOY.
// Championships and league-leader titles (scoring/assist/rebound) aren't exposed
// by stats.nba.com, so they're merged in from scripts/overrides.json (keyed by
// NBA player id; anyone not listed defaults to 0 for those four).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEST = join(ROOT, 'src', 'data', 'players.json');
const SEASON = '2025-26';
const PAUSE_MS = 600;
const SAVE_EVERY = 25;

const HEADERS = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
};

// leaguedashplayerstats is picky: every param must be present (mostly blank).
const LEAGUE_DASH_PARAMS = {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', PerMode: 'Totals',
    MeasureType: 'Base', PlusMinus: 'N', PaceAdjust: 'N', Rank: 'N',
    Outcome: '', Location: '', Month: '0', SeasonSegment: '', DateFrom: '', DateTo: '',
    OpponentTeamID: '0', VsConference: '', VsDivision: '', GameSegment: '', Period: '0',
    LastNGames: '0', TeamID: '0', Conference: '', Division: '', GameScope: '',
    PlayerExperience: '', PlayerPosition: '', StarterBench: '', DraftYear: '', DraftPick: '',
    College: '', Country: '', Height: '', Weight: '', ShotClockRange: '', PORound: '0',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => (v == null ? 0 : Number(v) || 0);
const pct = (v) => (v == null ? 0 : +(Number(v) * 100).toFixed(1));

function slugify(name) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function nbaGet(endpoint, params, attempt = 0) {
    const url = `https://stats.nba.com/stats/${endpoint}?` + new URLSearchParams(params);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        if (attempt < 3) {
            await sleep(1500 * (attempt + 1));
            return nbaGet(endpoint, params, attempt + 1);
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

function asObjects(resultSet) {
    if (!resultSet) return [];
    return resultSet.rowSet.map((row) =>
        Object.fromEntries(resultSet.headers.map((h, i) => [h, row[i]])));
}

function statLine(o) {
    const gp = n(o.GP);
    const per = (x) => (gp ? +(n(x) / gp).toFixed(1) : 0);
    return {
        ppg: per(o.PTS), rpg: per(o.REB), apg: per(o.AST), spg: per(o.STL), bpg: per(o.BLK),
        fgPct: pct(o.FG_PCT), fg3Pct: pct(o.FG3_PCT), ftPct: pct(o.FT_PCT),
        mpg: per(o.MIN),
        pts: n(o.PTS), reb: n(o.REB), ast: n(o.AST), stl: n(o.STL), blk: n(o.BLK),
        fg3m: n(o.FG3M), ftm: n(o.FTM), fgm: n(o.FGM),
        gp, gs: n(o.GS), min: n(o.MIN),
    };
}

// A player traded mid-season has one row per team; sum them and recompute %s.
function aggregate(objs) {
    if (objs.length === 0) return null;
    const keys = ['GP', 'GS', 'MIN', 'FGM', 'FGA', 'FG3M', 'FG3A', 'FTM', 'FTA', 'REB', 'AST', 'STL', 'BLK', 'PTS'];
    const s = {};
    for (const k of keys) s[k] = objs.reduce((a, o) => a + n(o[k]), 0);
    s.FG_PCT = s.FGA ? s.FGM / s.FGA : 0;
    s.FG3_PCT = s.FG3A ? s.FG3M / s.FG3A : 0;
    s.FT_PCT = s.FTA ? s.FTM / s.FTA : 0;
    return statLine(s);
}

// Players permanently excluded from the game (by NBA person id).
const EXCLUDED_NBA_IDS = new Set([
    1629634, // Brandon Clarke — excluded out of respect.
]);

// Everyone who played >=1 game and >=1 minute this season.
async function fetchSeasonRoster() {
    const json = await nbaGet('leaguedashplayerstats', LEAGUE_DASH_PARAMS);
    const rs = json.resultSets.find((r) => r.name === 'LeagueDashPlayerStats') || json.resultSets[0];
    return asObjects(rs)
        .filter((o) => n(o.GP) >= 1 && n(o.MIN) >= 1)
        .filter((o) => !EXCLUDED_NBA_IDS.has(n(o.PLAYER_ID)))
        .map((o) => ({ nbaId: o.PLAYER_ID, name: o.PLAYER_NAME }));
}

async function fetchStats(nbaId) {
    const json = await nbaGet('playercareerstats', { PlayerID: nbaId, PerMode: 'Totals', LeagueID: '00' });
    const sets = json.resultSets;
    const careerRow = asObjects(sets.find((r) => r.name === 'CareerTotalsRegularSeason'))[0];
    if (!careerRow) throw new Error('no career totals (bad PlayerID?)');
    const seasonRows = asObjects(sets.find((r) => r.name === 'SeasonTotalsRegularSeason'))
        .filter((o) => o.SEASON_ID === SEASON);
    return { career: statLine(careerRow), season: aggregate(seasonRows) };
}

// Team, position, and career span (first/last season's starting year).
async function fetchInfo(nbaId) {
    const json = await nbaGet('commonplayerinfo', { PlayerID: nbaId, LeagueID: '00' });
    const o = asObjects(json.resultSets.find((r) => r.name === 'CommonPlayerInfo'))[0] || {};
    return {
        team: o.TEAM_ABBREVIATION || '',
        position: o.POSITION || '',
        careerFrom: n(o.FROM_YEAR),
        careerTo: n(o.TO_YEAR),
    };
}

async function fetchAwards(nbaId) {
    const json = await nbaGet('playerawards', { PlayerID: nbaId });
    const objs = asObjects(json.resultSets.find((r) => r.name === 'PlayerAwards'));
    const count = (desc) => objs.filter((o) => o.DESCRIPTION === desc).length;
    return {
        mvp: count('NBA Most Valuable Player'),
        finalsMvp: count('NBA Finals Most Valuable Player'),
        allStar: count('NBA All-Star'),
        allNba: count('All-NBA'),
        allDefensive: count('All-Defensive Team'),
        dpoy: count('NBA Defensive Player of the Year'),
    };
}

async function save(out) {
    await writeFile(DEST, JSON.stringify(out, null, 2) + '\n');
}

async function main() {
    const overrides = JSON.parse(await readFile(join(__dirname, 'overrides.json'), 'utf8'));

    console.log(`Enumerating ${SEASON} roster from leaguedashplayerstats…`);
    const roster = await fetchSeasonRoster();
    console.log(`Found ${roster.length} players with >=1 game & >=1 minute. Fetching each (this takes a while)…\n`);

    const out = [];
    const usedIds = new Set();
    let failures = 0;

    for (let i = 0; i < roster.length; i++) {
        const p = roster[i];
        let id = slugify(p.name);
        if (!id || usedIds.has(id)) id = `${id || 'player'}-${p.nbaId}`;
        usedIds.add(id);

        try {
            const { career, season } = await fetchStats(p.nbaId);
            await sleep(PAUSE_MS);
            const awards = await fetchAwards(p.nbaId);
            await sleep(PAUSE_MS);
            const info = await fetchInfo(p.nbaId);
            await sleep(PAUSE_MS);

            const ov = overrides[p.nbaId] || {};
            const accolades = {
                mvp: awards.mvp,
                finalsMvp: awards.finalsMvp,
                championships: n(ov.championships),
                allStar: awards.allStar,
                allNba: awards.allNba,
                allDefensive: awards.allDefensive,
                dpoy: awards.dpoy,
                scoringTitles: n(ov.scoringTitles),
                assistTitles: n(ov.assistTitles),
                reboundTitles: n(ov.reboundTitles),
            };
            out.push({
                id, name: p.name, nbaId: p.nbaId,
                team: info.team, position: info.position,
                careerFrom: info.careerFrom, careerTo: info.careerTo,
                career, season, accolades,
            });
        } catch (e) {
            failures++;
            console.warn(`  !!  ${p.name} (${p.nbaId}) skipped — ${e.message}`);
        }

        if ((i + 1) % SAVE_EVERY === 0) {
            await save(out);
            console.log(`  …${i + 1}/${roster.length} processed, ${out.length} saved`);
        }
    }

    await save(out);
    console.log(`\nWrote ${out.length}/${roster.length} players -> ${DEST}`);
    if (failures) console.log(`${failures} skipped (transient blocks or missing career data).`);
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
