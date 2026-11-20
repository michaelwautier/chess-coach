/**
 * Parses "LABEL: text" sections from a (possibly partial, streamed) answer.
 * Keys are returned upper-case without accents ("LEÇON" → "LECON").
 */
export function parseSections(text: string, labels: readonly string[]): Record<string, string> {
  // Stripping accents keeps the string length for NFC input, so indexes map back to `clean`.
  const strip = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const alternatives = labels.map((l) => strip(l).toUpperCase().replace(/ /g, '\\s+')).join('|');
  const re = new RegExp(`^[\\s*#_-]*(${alternatives})[\\s*_]*:`, 'gmi');
  const clean = text.normalize('NFC');
  const normalized = strip(clean);
  const hits: { key: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    hits.push({ key: m[1].toUpperCase().replace(/\s+/g, ' '), start: m.index, end: m.index + m[0].length });
  }
  const out: Record<string, string> = {};
  hits.forEach((h, i) => {
    const stop = i + 1 < hits.length ? hits[i + 1].start : clean.length;
    out[h.key] = clean.slice(h.end, stop).replace(/\*\*/g, '').trim();
  });
  return out;
}

export const MISTAKE_LABELS = ['INDICE', 'EXPLICATION', 'LEÇON', 'THÈME'] as const;
export const ADVICE_LABELS = ['CONSEIL', 'PLAN'] as const;
export const SUMMARY_LABELS = ['BILAN', 'POINTS FORTS', 'À TRAVAILLER'] as const;
