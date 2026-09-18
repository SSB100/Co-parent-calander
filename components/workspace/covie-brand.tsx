type CovieMarkProps = {
  size?: number;
  primary?: string;
  secondary?: string;
  color?: string;
};

export function CovieMark({
  size = 32,
  primary = "#FF6B5F",
  secondary = "#19A897",
  color,
}: CovieMarkProps) {
  const first = color ?? primary;
  const second = color ?? secondary;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 7C14.6 7 7 14.6 7 24S14.6 41 24 41"
        stroke={first}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M24 41C33.4 41 41 33.4 41 24S33.4 7 24 7"
        stroke={second}
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CovieBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2.5 text-[#243139]"
      aria-label="Covie"
    >
      <CovieMark />
      {!compact ? (
        <span className="text-[28px] font-bold tracking-[-0.055em]">Covie</span>
      ) : null}
    </span>
  );
}
