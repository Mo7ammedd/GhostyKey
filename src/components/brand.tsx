import Link from "next/link";

export function GhostMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 26V12a8 8 0 0 1 16 0v14l-4-3-4 3-4-3-4 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 15v5m0-2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand ${compact ? "brand-small" : ""}`} aria-label="GhostKey home">
      <GhostMark />
      <span>GHOSTKEY<span className="brand-period">.</span></span>
    </Link>
  );
}

