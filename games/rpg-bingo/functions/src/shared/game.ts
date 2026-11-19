import { completedPatterns, selectPattern } from './patterns';
export { LINES } from './patterns';
import { selectPrize, type Prize } from './prizes';

export type Card = readonly (number | null)[];
export interface Game {
  readonly card: Card;
  readonly pattern?: string;
  readonly prize: Prize;
  readonly marked: ReadonlySet<number>;
  readonly won: boolean;
  readonly lastRoll: number | null;
  readonly rolls: number;
  readonly winningLines: readonly (readonly number[])[];
}

export function rollD20(random: () => number = Math.random): number {
  return Math.floor(random() * 20) + 1;
}

export function generateCard(random: () => number = Math.random): (number | null)[] {
  return Array.from({ length: 25 }, (_, index) =>
    index === 12 ? null : (index % 5) * 4 + Math.floor(random() * 4) + 1,
  );
}

export function newGame(random: () => number = Math.random, prizeRandom: () => number = Math.random, patternRandom: () => number = Math.random): Game {
  const card = generateCard(random);
  return {
    card, pattern: selectPattern(patternRandom),
    prize: selectPrize(prizeRandom),
    marked: new Set(), won: false, lastRoll: null, rolls: 0, winningLines: [],
  };
}

export function isMarked(game: Game, index: number): boolean {
  const number = game.card[index];
  return number === null || game.marked.has(number);
}

function applyMarks(game: Game, marked: ReadonlySet<number>): Game {
  const next = { ...game, marked };
  const winningLines = completedPatterns(game.pattern, index => isMarked(next, index));
  return { ...next, winningLines, won: winningLines.length > 0 };
}

export function toggleNumber(game: Game, number: number): Game {
  if (game.won || !game.card.includes(number)) return game;
  const marked = new Set(game.marked);
  if (marked.has(number)) marked.delete(number);
  else marked.add(number);
  return applyMarks(game, marked);
}

export function roll(game: Game, random: () => number = Math.random): Game {
  const lastRoll = rollD20(random);
  const next = { ...game, lastRoll, rolls: game.rolls + 1 };
  if (game.won) return next;
  return applyMarks(next, new Set([...game.marked, lastRoll]));
}
