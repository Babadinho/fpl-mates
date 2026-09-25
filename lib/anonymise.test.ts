import { describe, expect, it } from 'vitest';
import { pseudonym } from './anonymise';

/**
 * A demo runs off a real league, so the stand-in has to behave like a name:
 * the same one every time, different between people, and spread widely enough
 * that a league of a thousand does not read as a list of duplicates.
 */
describe('pseudonym', () => {
  it('gives a manager the same name every time', () => {
    expect(pseudonym(4413726)).toEqual(pseudonym(4413726));
  });

  /**
   * Entry ids in a league are often close together, having been registered in
   * the same week. Without the hash they would land on neighbouring names and
   * the table would read as a straight run down the list.
   */
  it('separates managers who registered minutes apart', () => {
    const run = [100001, 100002, 100003, 100004, 100005].map((id) => pseudonym(id).playerName);
    expect(new Set(run).size).toBe(run.length);
  });

  it('gives a team name as well as a player name', () => {
    const { playerName, entryName } = pseudonym(777);
    expect(playerName).toMatch(/^\S+ \S+$/);
    expect(entryName).toMatch(/^\S+ \S+$/);
  });

  /**
   * Uniqueness cannot be guaranteed by a function that sees one manager at a
   * time, so what matters is the rate. Under 2% across a league of a thousand
   * is about what a real league produces, and nobody reads it as a bug.
   */
  it('repeats a name rarely enough to pass for a real league', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => 1_000_000 + i * 37);
    const names = ids.map((id) => pseudonym(id).playerName);
    const duplicates = names.length - new Set(names).size;

    expect(duplicates / names.length).toBeLessThan(0.02);
  });

  it('does not leak the entry id into the name', () => {
    const { playerName, entryName } = pseudonym(4413726);
    expect(`${playerName} ${entryName}`).not.toMatch(/\d/);
  });
});
