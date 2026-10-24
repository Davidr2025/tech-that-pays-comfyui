/**
 * "Tangled vs connected": the client's own tools, drawn two ways.
 *
 *   tangled    the tools wired to each other by hand, criss-crossing
 *   connected  the same tools feeding one place
 *
 * Pure SVG, no state, no randomness: the same tools always draw the same picture, so it can sit
 * in a server-rendered, printed document. Colours come from CSS variables the page defines
 * (--brand, --accent) with fixed fallbacks.
 */
const W = 420;
const H = 270;
const CX = W / 2;
const CY = H / 2;

function layout(count: number) {
  const rx = 148;
  const ry = 92;
  return Array.from({ length: count }, (_, i) => {
    const a = (-90 + (360 / count) * i) * (Math.PI / 180);
    return { x: CX + rx * Math.cos(a), y: CY + ry * Math.sin(a) };
  });
}

const short = (name: string) => (name.length > 17 ? `${name.slice(0, 16)}…` : name);

export function WorkflowDiagram({ tools, variant, label }: { tools: string[]; variant: "tangled" | "connected"; label: string }) {
  const names = tools.slice(0, 8);
  const pts = layout(names.length);
  const tangled = variant === "tangled";

  const edges: [number, number][] = [];
  if (tangled) {
    const seen = new Set<string>();
    names.forEach((_, i) => {
      for (const step of [2, 3]) {
        const j = (i + step) % names.length;
        const key = [Math.min(i, j), Math.max(i, j)].join("-");
        if (i !== j && !seen.has(key)) {
          seen.add(key);
          edges.push([i, j]);
        }
      }
    });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
      <title>{label}</title>
      {tangled
        ? edges.map(([a, b], k) => {
            const p = pts[a]!;
            const q = pts[b]!;
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            const bend = (k % 2 === 0 ? 1 : -1) * 22;
            return <path key={k} d={`M ${p.x} ${p.y} Q ${mx + bend} ${my - bend} ${q.x} ${q.y}`} fill="none" stroke="#b45309" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.75" />;
          })
        : pts.map((p, i) => <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="var(--brand, #0f766e)" strokeWidth="1.8" />)}

      {!tangled && (
        <g>
          <rect x={CX - 62} y={CY - 22} width="124" height="44" rx="10" fill="var(--brand, #0f766e)" />
          <text x={CX} y={CY + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#ffffff">
            One dashboard
          </text>
        </g>
      )}

      {names.map((name, i) => {
        const p = pts[i]!;
        return (
          <g key={name}>
            <rect x={p.x - 56} y={p.y - 15} width="112" height="30" rx="6" fill="#ffffff" stroke={tangled ? "#b45309" : "var(--brand, #0f766e)"} strokeWidth="1.4" strokeDasharray={tangled ? "3 2" : undefined} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fill="#1f2937">
              {short(name)}
            </text>
          </g>
        );
      })}

      {tangled && (
        <text x={CX} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#92400e">
          copy, paste and re-type between each
        </text>
      )}
    </svg>
  );
}
