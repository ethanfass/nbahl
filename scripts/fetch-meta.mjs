// Backfills team, position, and career span onto an EXISTING src/data/players.json
// without re-fetching every player's stats.
//
//   node scripts/fetch-meta.mjs        (or: npm run fetch:meta)
//
// It makes only ~31 calls total:
//   commonallplayers   -> team abbreviation + FROM_YEAR/TO_YEAR for everyone (1 call)
//   commonteamroster   -> POSITION per player, one call per active team (~30 calls)
//
// Like the main fetch, run this from a residential connection — stats.nba.com
// tends to block datacenter IPs. It only adds fields; existing data is untouched.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEST = join(__dirname, '..', 'src', 'data', 'players.json');
const SEASON = '2025-26';
const PAUSE_MS = 600;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => (v == null ? 0 : Number(v) || 0);

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

async function main() {
    const players = JSON.parse(await readFile(DEST, 'utf8'));
    console.log(`Loaded ${players.length} players from players.json`);

    // 1) team + career span for everyone, in a single call.
    console.log('Fetching commonallplayers (team + career years)…');
    const allJson = await nbaGet('commonallplayers', {
        LeagueID: '00', Season: SEASON, IsOnlyCurrentSeason: '0',
    });
    const all = asObjects(allJson.resultSets.find((r) => r.name === 'CommonAllPlayers') || allJson.resultSets[0]);
    const byId = new Map();
    const teamIds = new Set();
    for (const o of all) {
        byId.set(n(o.PERSON_ID), {
            team: o.TEAM_ABBREVIATION || '',
            careerFrom: n(o.FROM_YEAR),
            careerTo: n(o.TO_YEAR),
            teamId: n(o.TEAM_ID),
        });
        if (n(o.TEAM_ID)) teamIds.add(n(o.TEAM_ID));
    }

    // 2) position per player, one roster call per active team.
    console.log(`Fetching ${teamIds.size} team rosters for positions…`);
    const positionById = new Map();
    let done = 0;
    for (const teamId of teamIds) {
        try {
            const json = await nbaGet('commonteamroster', { TeamID: teamId, Season: SEASON, LeagueID: '00' });
            const roster = asObjects(json.resultSets.find((r) => r.name === 'CommonTeamRoster') || json.resultSets[0]);
            for (const o of roster) positionById.set(n(o.PLAYER_ID), o.POSITION || '');
        } catch (e) {
            console.warn(`  !!  team ${teamId} roster failed — ${e.message}`);
        }
        done++;
        if (done % 10 === 0) console.log(`  …${done}/${teamIds.size} rosters`);
        await sleep(PAUSE_MS);
    }

    // 3) merge into players.json (only set fields we actually found).
    let teamCount = 0, posCount = 0, yearCount = 0;
    for (const p of players) {
        const info = byId.get(n(p.nbaId));
        if (info) {
            if (info.team) { p.team = info.team; teamCount++; }
            if (info.careerFrom && info.careerTo) { p.careerFrom = info.careerFrom; p.careerTo = info.careerTo; yearCount++; }
        }
        const pos = positionById.get(n(p.nbaId));
        if (pos) { p.position = pos; posCount++; }
    }

    await writeFile(DEST, JSON.stringify(players, null, 2) + '\n');
    console.log(`\nUpdated ${players.length} players -> ${DEST}`);
    console.log(`  team: ${teamCount}, position: ${posCount}, career years: ${yearCount}`);
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
