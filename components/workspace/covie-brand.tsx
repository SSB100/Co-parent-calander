export function CovieMark({ size = 32, color = "#416653" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 44" fill="none" aria-hidden="true">
    <rect x="4" y="9" width="32" height="31" rx="7" stroke={color} strokeWidth="3" />
    <path d="M5 17V15C5 11 8 9 12 9H28C32 9 35 12 35 15V17H5Z" fill={color} />
    <path d="M12 4V12M28 4V12" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    <rect x="9" y="22" width="22" height="5" rx="2" fill={color} />
    <rect x="9" y="30" width="22" height="5" rx="2" fill={color} />
    <path d="M15 22V27M15 30V35" stroke="#F7F6F2" strokeWidth="1" />
  </svg>;
}

export function CovieBrand({ compact = false }: { compact?: boolean }) {
  return <span className="inline-flex items-center gap-2.5 text-emerald-800" aria-label="Covie">
    <CovieMark />
    {!compact && <span className="text-[27px] font-semibold tracking-[-0.045em]">Covie</span>}
  </span>;
}
