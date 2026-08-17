/**
 * Confirms our picks and live schemas against the real API. Run after a
 * deadline has passed — before that both endpoints return nothing.
 * Usage: pnpm exec tsx scripts/check-shapes.ts <entryId> <gameweek>
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });

const UA = { 'User-Agent': 'fpl-mates/0.1.0 (+https://www.fplmates.com)' };
const BASE = 'https://fantasy.premierleague.com/api';

async function main() {
  const entry = process.argv[2] ?? '3710445';
  const gw = process.argv[3] ?? '1';

  const picks = await (await fetch(`${BASE}/entry/${entry}/event/${gw}/picks/`, { headers: UA })).json();
  if ((picks as any).detail) {
    console.log(`picks: ${(picks as any).detail} — no deadline has passed for GW${gw} yet`);
  } else {
    const p = picks as any;
    console.log('picks top-level  :', Object.keys(p).join(', '));
    console.log('one pick         :', Object.keys(p.picks[0]).join(', '));
    console.log('automatic_subs   :', 'automatic_subs' in p ? JSON.stringify(p.automatic_subs).slice(0, 120) : 'ABSENT');
    console.log('entry_history    :', Object.keys(p.entry_history).join(', '));
  }

  const live = await (await fetch(`${BASE}/event/${gw}/live/`, { headers: UA })).json();
  const els = (live as any).elements ?? [];
  if (els.length === 0) {
    console.log(`live: no elements for GW${gw} yet`);
  } else {
    console.log('live element     :', Object.keys(els[0]).join(', '));
    console.log('live stats       :', Object.keys(els[0].stats).join(', '));
    console.log('explain          :', 'explain' in els[0] ? JSON.stringify(els[0].explain).slice(0, 200) : 'ABSENT');
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
