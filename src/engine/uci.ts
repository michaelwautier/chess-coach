import type { Score } from '@/chess/types';

export interface InfoLine extends Score {
  depth: number;
  multipv: number;
  /** Principal variation in UCI notation. */
  pv: string[];
}

export interface SearchResult {
  bestmove: string | null;
  /** Best line per MultiPV slot, from the deepest depth fully reported. */
  lines: InfoLine[];
  depth: number;
}

/** Parses a UCI "info … pv …" line. Bound scores and lines without a PV are ignored. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  if (line.includes(' lowerbound') || line.includes(' upperbound')) return null;
  const t = line.split(' ');
  const info: InfoLine = { multipv: 1, depth: 0, cp: null, mate: null, pv: [] };
  for (let i = 1; i < t.length; i++) {
    const key = t[i];
    if (key === 'depth') info.depth = Number(t[++i]);
    else if (key === 'multipv') info.multipv = Number(t[++i]);
    else if (key === 'score') {
      const kind = t[++i];
      const value = Number(t[++i]);
      if (kind === 'cp') info.cp = value;
      else if (kind === 'mate') info.mate = value;
    } else if (key === 'pv') {
      info.pv = t.slice(i + 1);
      break;
    }
  }
  return info.cp === null && info.mate === null ? null : info;
}

/** Picks, among all reported depths, the deepest one where every MultiPV slot is present. */
export function collectLines(
  byDepth: Map<number, Map<number, InfoLine>>,
  latest: Map<number, InfoLine>,
): InfoLine[] {
  const expected = Math.max(1, latest.size);
  const depths = [...byDepth.keys()].sort((a, b) => b - a);
  let chosen: Map<number, InfoLine> | undefined;
  for (const d of depths) {
    if (byDepth.get(d)!.size >= expected) {
      chosen = byDepth.get(d);
      break;
    }
  }
  return [...(chosen ?? latest).values()].sort((a, b) => a.multipv - b.multipv);
}

export const lineScore = (l: InfoLine): Score => ({ cp: l.cp, mate: l.mate });
