// 아주 작은 프론트매터 파서 (추가 의존성 없이)
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };

  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    val = val.trim().replace(/^["'](.*)["']$/, '$1');
    if (/^\[.*\]$/.test(val)) {
      meta[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["'](.*)["']$/, '$1')).filter(Boolean);
    } else if (key === 'tags' && val.includes(',')) {
      meta[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body: raw.slice(m[0].length) };
}
