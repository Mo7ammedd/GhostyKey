import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand"><Brand compact /><span>A little less permanent.</span></div>
        <div className="footer-links">
          <span className="footer-note">Your secrets. Your control.</span>
          <a className="creator-link" href="https://modev.me" target="_blank" rel="noopener noreferrer" aria-label="Built by modev.me (opens in a new tab)">
            Built by <span>modev.me</span><ArrowUpRight size={12} />
          </a>
          <Link href="/security">Security & privacy <ArrowUpRight size={12} /></Link>
        </div>
      </div>
    </footer>
  );
}
