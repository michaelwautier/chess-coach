import { Chess } from 'chess.js';

const FR_PIECE: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };

/** Converts English SAN (Nf3, exd8=Q) to French SAN (Cf3, exd8=D). */
export function frSan(san: string): string {
  if (!san) return '';
  let s = san;
  if (FR_PIECE[s[0]]) s = FR_PIECE[s[0]] + s.slice(1);
  return s.replace(/=([QRBN])/, (_, p: string) => `=${FR_PIECE[p]}`);
}

/** Converts UCI moves played from `fen` into SAN. Stops at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[], max = 99): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves.slice(0, max)) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Formats a SAN line played from `fen` with move numbers, in French notation. */
export function formatLine(fen: string, sanList: string[]): string {
  const parts = fen.split(' ');
  let moveNo = Number(parts[5]);
  let white = parts[1] === 'w';
  const out: string[] = [];
  sanList.forEach((san, i) => {
    if (white) out.push(`${moveNo}. ${frSan(san)}`);
    else out.push(i === 0 ? `${moveNo}… ${frSan(san)}` : frSan(san));
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

/** Numbered move text (French notation) for the last `lastPlies` plies of a game started from the initial position. */
export function movesText(sanHistory: string[], lastPlies = 12): string {
  const parts = sanHistory.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${frSan(san)}` : frSan(san)));
  if (sanHistory.length <= lastPlies) return parts.join(' ');
  const start = sanHistory.length - lastPlies;
  const tail = parts.slice(start);
  if (start % 2 === 1) tail[0] = `${Math.floor(start / 2) + 1}… ${tail[0]}`;
  return `… ${tail.join(' ')}`;
}

/** "12." for White's move at ply 22, "12…" for Black's move at ply 23. */
export const moveNumberLabel = (ply: number): string =>
  `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'}`;

export const uciOf = (m: { from: string; to: string; promotion?: string }): string =>
  m.from + m.to + (m.promotion ?? '');
