import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleDashed, Fingerprint, KeyRound, Link2, LockKeyhole, ShieldCheck } from "lucide-react";
import { CreateSecret } from "@/components/create-secret";

const steps = [
  { number: "01", title: "Encrypt", description: "Your secret is encrypted in your browser. The key stays with you.", icon: LockKeyhole },
  { number: "02", title: "Share", description: "Send a private link. Only an encrypted payload reaches our server.", icon: Link2 },
  { number: "03", title: "Reveal", description: "Your recipient opens the link and decrypts the secret locally.", icon: KeyRound },
  { number: "04", title: "Disappear", description: "When its views or time run out, the encrypted secret is deleted.", icon: CircleDashed },
];

export default function HomePage() {
  return (
    <main className="landing-main">
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-cross cross-left" aria-hidden="true">+</div><div className="hero-cross cross-right" aria-hidden="true">+</div>
        <span className="status-pill"><span className="status-dot" />PRIVATE BY DESIGN. TEMPORARY BY DEFAULT.</span>
        <h1 id="hero-heading">Secrets that <span>disappear.</span></h1>
        <p className="hero-description">Some things aren’t meant to stay.<br />Share sensitive information through temporary, encrypted links.</p>
        <div className="trust-row"><span><Check size={11} />Client-side encryption</span><span><Check size={11} />No account required</span><span><Check size={11} />Auto expiration</span></div>
      </section>

      <section className="composer-section" aria-label="Create an encrypted secret">
        <CreateSecret />
        <div className="technical-specs">
          <div><span className="spec-label">ENCRYPTION</span><span>AES-256-GCM<LockKeyhole size={12} /></span></div>
          <div><span className="spec-label">DEFAULT ACCESS</span><span>ONE-TIME<EyeIcon /></span></div>
          <div><span className="spec-label">DEFAULT EXPIRY</span><span>24 HOURS<CircleDashed size={12} /></span></div>
          <div><span className="spec-label">SERVER KNOWLEDGE</span><span>ZERO<Fingerprint size={12} /></span></div>
        </div>
      </section>

      <section className="how-section" id="how-it-works" aria-labelledby="how-heading">
        <div className="section-topline"><span className="eyebrow">THE LIFECYCLE OF A SECRET</span><ArrowDown size={14} /></div>
        <div className="how-heading"><h2 id="how-heading">Four steps. <span>Zero trace of the plaintext.</span></h2><Link href="/security">Built on trust. Backed by math. <ArrowUpRight size={13} /></Link></div>
        <div className="steps-grid">{steps.map((step, index) => <article key={step.number} className="step"><div className="step-top"><span className="step-number">{step.number}</span><step.icon size={18} strokeWidth={1.3} />{index < steps.length - 1 && <ArrowRight className="step-connector" size={14} strokeWidth={1} />}</div><h3>{step.title}<span>.</span></h3><p>{step.description}</p></article>)}</div>
      </section>

      <div className="privacy-strip"><ShieldCheck size={17} strokeWidth={1.5} /><p>We can’t read what you share.<span> Your encryption key never reaches our servers.</span></p><Link href="/security" aria-label="Read about the GhostKey security model"><ArrowUpRight size={16} /></Link></div>
    </main>
  );
}

function EyeIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

