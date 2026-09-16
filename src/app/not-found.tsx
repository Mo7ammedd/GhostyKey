import Link from "next/link";
import { ArrowRight, CircleDashed } from "lucide-react";

export default function NotFound() {
  return <main className="viewer-main"><section className="viewer-state"><div className="state-icon state-icon-large"><CircleDashed size={30} strokeWidth={1.2} /></div><span className="eyebrow">404 / NOT FOUND</span><h1>This page disappeared.</h1><p>Some things are temporary. This page may have moved, or the link may be incorrect.</p><Link href="/" className="button button-primary">Back to GhostKey <ArrowRight size={15} /></Link></section></main>;
}

