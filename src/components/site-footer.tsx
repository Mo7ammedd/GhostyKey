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
          <Link href="/security">Security & privacy <ArrowUpRight size={12} /></Link>
        </div>
      </div>
    </footer>
  );
}

