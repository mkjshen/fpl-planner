// FPL's own fixture difficulty (FDR) palette — the same five colours the
// official site uses, so a manager reads it without a legend. Each pairs a
// text colour that keeps the rating digit at 4.5:1 or better on it, since
// the digit (not the colour) is what carries the meaning. A plain module
// (not a client component) so server-rendered pages like the landing page
// can use it too.
const DIFFICULTY_CLASSES: Record<number, string> = {
  1: "bg-[#375523] text-white",
  2: "bg-[#01fc7a] text-[#0a0a0a]",
  3: "bg-[#e7e7e7] text-zinc-800",
  4: "bg-[#ff1751] text-[#0a0a0a]",
  5: "bg-[#80072d] text-white",
};

export function difficultyClass(difficulty: number): string {
  return DIFFICULTY_CLASSES[difficulty] ?? DIFFICULTY_CLASSES[3];
}
