import { describe, expect, it } from 'vitest';
import { mockSquad } from './squads';
import { mockScores } from './mock';

/**
 * The mock exists to make the design reviewable, so its job is to be
 * indistinguishable from real data. A squad that does not add up to the total
 * beside it reads as a scoring bug.
 */
describe('mock squads', () => {
  const scores = mockScores();

  it('always adds up to the stored gross, for every manager and gameweek', () => {
    for (const row of scores) {
      const squad = mockSquad(row.entryId, row.event, row.grossPoints, row.chipUsed, row.transferCost);
      const counted = squad.chip === 'BB' ? [...squad.xi, ...squad.bench] : squad.xi;
      const total = counted.reduce((sum, p) => sum + p.points * Math.max(1, p.multiplier), 0);

      expect(total, `entry ${row.entryId} gw ${row.event}`).toBe(row.grossPoints);
    }
  });

  it('is a legal squad', () => {
    const squad = mockSquad(100000, 5, 62, null, 0);

    expect(squad.xi).toHaveLength(11);
    expect(squad.bench).toHaveLength(4);
    expect(squad.xi.filter((p) => p.position === 'GK')).toHaveLength(1);
    // The reserve keeper is always the first substitute.
    expect(squad.bench[0].position).toBe('GK');

    const names = [...squad.xi, ...squad.bench].map((p) => p.name);
    expect(new Set(names).size, 'nobody picked twice').toBe(15);
  });

  it('never gives the armband to a goalkeeper or defender', () => {
    for (const event of [1, 3, 7, 12]) {
      for (const entry of [100000, 100014, 100035]) {
        const squad = mockSquad(entry, event, 60, null, 0);
        const captain = squad.xi.find((p) => p.isCaptain);
        expect(['MID', 'FWD']).toContain(captain?.position);
      }
    }
  });

  it('has exactly one captain and one vice, both starting', () => {
    for (const event of [1, 4, 9, 12]) {
      const squad = mockSquad(100014, event, 70, null, 0);
      expect(squad.xi.filter((p) => p.isCaptain)).toHaveLength(1);
      expect(squad.xi.filter((p) => p.isVice)).toHaveLength(1);
      expect(squad.bench.some((p) => p.isCaptain || p.isVice)).toBe(false);
    }
  });

  it('doubles the captain, and triples them under Triple Captain', () => {
    expect(mockSquad(100000, 3, 60, null, 0).xi.find((p) => p.isCaptain)?.multiplier).toBe(2);
    expect(mockSquad(100000, 3, 60, 'TC', 0).xi.find((p) => p.isCaptain)?.multiplier).toBe(3);
  });

  it('scores the bench only under Bench Boost', () => {
    expect(mockSquad(100007, 6, 60, null, 0).bench.every((p) => p.multiplier === 0)).toBe(true);
    expect(mockSquad(100007, 6, 60, 'BB', 0).bench.every((p) => p.multiplier === 1)).toBe(true);
  });

  it('is deterministic', () => {
    const a = mockSquad(100021, 8, 55, null, 4);
    const b = mockSquad(100021, 8, 55, null, 4);
    expect(a).toEqual(b);
  });

  it('never awards points to someone who did not play', () => {
    for (const event of [2, 5, 11]) {
      for (const p of mockSquad(100035, event, 64, null, 0).xi) {
        if (p.minutes === 0) expect(p.points).toBe(0);
      }
    }
  });
});
