type PositionedText = {
  str: string;
  transform: number[];
  height: number;
};

// PDF drawing order is not reading order. In particular, merged box-name cells
// can be emitted after the entire equipment table. Rebuild visual rows first.
export function pdfPageText(items: unknown[]) {
  const positioned = items.filter((item): item is PositionedText => {
    if (!item || typeof item !== 'object') return false;
    const text = item as Partial<PositionedText>;
    return typeof text.str === 'string' && Boolean(text.str.trim())
      && Array.isArray(text.transform) && text.transform.length >= 6
      && Number.isFinite(text.transform[4]) && Number.isFinite(text.transform[5]);
  }).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

  const rows: { y: number; tolerance: number; items: PositionedText[] }[] = [];
  for (const item of positioned) {
    const y = item.transform[5];
    const tolerance = Math.max(1, Math.min(3, (item.height || 8) / 4));
    const row = rows.at(-1);
    if (row && Math.abs(row.y - y) <= Math.min(row.tolerance, tolerance)) {
      row.items.push(item);
    } else {
      rows.push({ y, tolerance, items: [item] });
    }
  }
  return rows.map((row) => row.items.sort((a, b) => a.transform[4] - b.transform[4])
    .map((item) => item.str.trim()).join(' ')).join('\n');
}
