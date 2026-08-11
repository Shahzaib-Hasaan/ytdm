/**
 * Live bandwidth trace for an active download — the row's instrument readout.
 * Pure SVG, no libs; scales to the sample max so shape stays readable.
 */
export default function Sparkline(props: { samples: number[] }): React.JSX.Element {
  const W = 64
  const H = 18
  const { samples } = props
  if (samples.length < 2) {
    return <svg width={W} height={H} aria-hidden className="opacity-40" />
  }
  const max = Math.max(...samples, 1)
  const step = W / (samples.length - 1)
  const pts = samples.map((v, i) => `${(i * step).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`)
  const area = `0,${H} ${pts.join(' ')} ${W},${H}`
  return (
    <svg width={W} height={H} aria-hidden className="shrink-0">
      <polygon points={area} fill="var(--t-accent)" opacity="0.12" />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--t-accent)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}
