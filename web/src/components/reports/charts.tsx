import { cn } from '@/lib/utils';

/**
 * Grafik digambar sebagai SVG di server, tanpa pustaka.
 *
 * Data yang ditampilkan di sini hanya belasan titik; memuat pustaka grafik
 * untuk itu berarti mengirim ratusan kilobyte demi belasan persegi panjang.
 * Yang penting justru dipenuhi tanpa pustaka: setiap label menyebut nilai yang
 * benar-benar dicapai grafik, warnanya diambil dari token tema sehingga terbaca
 * pada kedua tema, dan tidak ada bentuk yang keluar dari kotak gambarnya.
 */

export type BarPoint = { label: string; value: number };

export function BarChart({
  points,
  formatValue,
  className,
  height = 220,
}: {
  points: BarPoint[];
  formatValue: (n: number) => string;
  className?: string;
  height?: number;
}) {
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  /* Sumbu dibulatkan ke atas supaya batang tertinggi tidak menyentuh tepi. */
  const ceiling = niceCeiling(max);
  const ticks = [ceiling, ceiling * 0.5, 0];

  const PAD_L = 56;
  const PAD_B = 26;
  const PAD_T = 8;
  const width = 640;
  const plotW = width - PAD_L;
  const plotH = height - PAD_B - PAD_T;
  const slot = plotW / points.length;
  const barW = Math.min(22, slot * 0.5);

  return (
    <div className={cn('scroll-x', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Grafik batang, ${points.length} titik, tertinggi ${formatValue(max)}`}
        className="h-auto w-full min-w-[520px]"
      >
        {ticks.map((t) => {
          const y = PAD_T + plotH - (t / ceiling) * plotH;
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={width} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text
                x={PAD_L - 10} y={y + 4} textAnchor="end"
                fill="var(--ink-3)" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatValue(t)}
              </text>
            </g>
          );
        })}

        {points.map((p, i) => {
          const h = ceiling === 0 ? 0 : (p.value / ceiling) * plotH;
          const x = PAD_L + i * slot + (slot - barW) / 2;
          const y = PAD_T + plotH - h;
          return (
            <g key={p.label}>
              <rect
                x={x} y={y} width={barW} height={Math.max(h, p.value > 0 ? 2 : 0)}
                rx="3" fill="var(--primary)"
              >
                <title>{`${p.label}: ${formatValue(p.value)}`}</title>
              </rect>
              <text
                x={PAD_L + i * slot + slot / 2} y={height - 8}
                textAnchor="middle" fill="var(--ink-3)" fontSize="11"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

export function Donut({
  slices,
  total,
  totalLabel,
  className,
}: {
  slices: DonutSlice[];
  total: number;
  totalLabel: string;
  className?: string;
}) {
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const size = 132;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className={cn('flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`} width={size} height={size}
          role="img" aria-label={`${totalLabel}: ${total}`}
        >
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--surface-2)" strokeWidth={stroke}
          />
          {sum > 0 && slices.map((s) => {
            const fraction = s.value / sum;
            const dash = fraction * circumference;
            const el = (
              <circle
                key={s.label}
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-[24px] font-semibold leading-none text-ink">{total}</span>
          <span className="t-meta mt-1">{totalLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
            <span className="tnum shrink-0 font-medium text-ink">{s.value}</span>
            <span className="tnum t-meta w-10 shrink-0 text-right">
              {sum > 0 ? Math.round((s.value / sum) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Batas atas yang enak dibaca: 1, 2, atau 5 dikali pangkat sepuluh. */
function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}
