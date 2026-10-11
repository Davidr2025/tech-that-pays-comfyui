// Infinite text ticker (React Bits "ScrollVelocity"-adjacent, pure CSS for reliability).
export default function Marquee({ items }) {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i}>
            {t}
            <i>✦</i>
          </span>
        ))}
      </div>
    </div>
  );
}
