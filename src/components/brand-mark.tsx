type BrandMarkProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function BrandMark({ size = 40, withWordmark = true, className = "" }: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className="shrink-0"
      >
        <rect x="2" y="2" width="60" height="60" rx="18" fill="#fff1e6" stroke="#e4cdb8" strokeWidth="2" />
        <path d="M32 9v46" stroke="#d8b7a0" strokeWidth="1.5" strokeDasharray="2.6 2.6" opacity="0.95" />
        <path
          d="M14 46V18l10 12 8-12 8 12 10-12v28"
          fill="none"
          stroke="#d64f72"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M50 46V18l-10 12-8-12-8 12-10-12v28"
          fill="none"
          stroke="#f2a27a"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
      </svg>
      {withWordmark ? (
        <span className="text-lg font-semibold tracking-[-0.02em] text-slate-900">MirrorMe</span>
      ) : null}
    </div>
  );
}
