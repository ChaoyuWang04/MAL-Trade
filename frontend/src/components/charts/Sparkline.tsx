type SparklineProps = {
  points: number[];
  width?: number;
  height?: number;
};

export function Sparkline({ points, width = 220, height = 64 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const padding = 6;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const toX = (i: number) => padding + (i / (points.length - 1)) * usableW;
  const toY = (v: number) => padding + (1 - (v - min) / range) * usableH;

  const d = points
    .map((v, i) => `${toX(i).toFixed(2)},${toY(v).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
    >
      <polyline
        fill="none"
        stroke="rgba(110,231,183,0.95)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={d}
      />
    </svg>
  );
}

