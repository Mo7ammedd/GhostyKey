export function AmbientBackground() {
  return (
    <div className="ambient-background" aria-hidden="true">
      <div className="ambient-glow" />
      <div className="ambient-grid" />
      <svg className="ambient-contours" viewBox="0 0 1600 1000" fill="none">
        <defs>
          <linearGradient id="contour-light" x1="280" y1="30" x2="1290" y2="880" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" stopOpacity="0.04" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.19" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="url(#contour-light)" strokeWidth="1">
          <ellipse cx="800" cy="310" rx="730" ry="320" transform="rotate(-24 800 310)" />
          <ellipse cx="800" cy="310" rx="790" ry="380" transform="rotate(-24 800 310)" />
          <ellipse cx="800" cy="310" rx="850" ry="440" transform="rotate(-24 800 310)" />
          <ellipse cx="800" cy="310" rx="910" ry="500" transform="rotate(-24 800 310)" />
          <ellipse cx="800" cy="310" rx="970" ry="560" transform="rotate(-24 800 310)" />
        </g>
      </svg>
      <div className="ambient-rail ambient-rail-left" />
      <div className="ambient-rail ambient-rail-right" />
      <div className="ambient-grain" />
    </div>
  );
}
