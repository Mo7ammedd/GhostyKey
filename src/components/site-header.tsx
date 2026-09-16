import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/#how-it-works" className="nav-link how-link">How it works</Link>
          <Link href="/security" className="nav-link">Security</Link>
          <a className="github-link" href="https://github.com/Mo7ammedd/GhostyKey" target="_blank" rel="noopener noreferrer" aria-label="GhostKey source on GitHub (opens in a new tab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.08c-3.09.67-3.74-1.31-3.74-1.31-.51-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.7 1.14 1.7 1.14 1 1.7 2.6 1.21 3.24.93.1-.73.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.49 0-1.21.43-2.2 1.14-2.98-.12-.28-.5-1.41.11-2.93 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.52.23 2.65.11 2.93.71.78 1.14 1.77 1.14 2.98 0 4.26-2.6 5.2-5.08 5.48.4.34.75 1.02.75 2.06v3.06c0 .3.2.65.76.54A11.1 11.1 0 0 0 12 .9Z" /></svg><span>GitHub</span><ArrowUpRight size={13} />
          </a>
        </nav>
      </div>
    </header>
  );
}
