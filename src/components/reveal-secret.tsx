"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CheckCheck, CircleSlash2, Copy, Eye, EyeOff, Fingerprint, Hourglass, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, ShieldX } from "lucide-react";
import { GhostMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Countdown } from "@/components/ui/countdown";
import { useClipboard } from "@/lib/hooks/use-clipboard";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { useSecretViewer, type ViewerErrorCode } from "@/lib/hooks/use-secret-viewer";
import type { SecretMetadata } from "@/types/secrets";

const ERROR_CONTENT: Record<ViewerErrorCode, { label: string; title: string; description: string }> = {
  SECRET_CONSUMED: { label: "SECRET CONSUMED", title: "Gone. As promised.", description: "This secret has reached its view limit or was deleted by its creator. Its encrypted contents are no longer available." },
  SECRET_EXPIRED: { label: "SECRET EXPIRED", title: "Some things don’t wait.", description: "This link has expired. Its encrypted contents are no longer available. Ask the sender to create a new link." },
  SECRET_NOT_FOUND: { label: "SECRET NOT FOUND", title: "Nothing here to reveal.", description: "This link may be incorrect, or the secret was removed. Check the complete link with the person who sent it." },
  INVALID_SECRET_ID: { label: "INVALID LINK", title: "Something’s missing.", description: "This secret link is not valid. Ask the sender for the complete, original link." },
  MISSING_KEY: { label: "KEY MISSING", title: "A secret needs its key.", description: "The encryption key is missing or incomplete. Ask the sender for the full link, including everything after the # symbol. No view has been used." },
  DECRYPTION_FAILED: { label: "DECRYPTION FAILED", title: "The key doesn’t fit.", description: "The encrypted payload could not be opened with this key. This request used a view, so a one-time secret is now consumed. Ask the sender for a new link." },
  NETWORK_ERROR: { label: "CONNECTION INTERRUPTED", title: "We lost the connection.", description: "We couldn’t complete the request. If you had already confirmed a reveal, its view may have been used. Reopen the original link to check, or ask the sender for a new one." },
  CRYPTO_UNAVAILABLE: { label: "SECURE BROWSER REQUIRED", title: "Let’s keep this secure.", description: "Open this link over HTTPS in a modern browser that supports Web Crypto. No view has been used." },
  PAYLOAD_TOO_LARGE: { label: "INVALID PAYLOAD", title: "This secret is too large.", description: "Ask the sender to create a new secret smaller than 1 MB." },
  INVALID_REQUEST: { label: "REQUEST UNAVAILABLE", title: "That didn’t go through.", description: "We couldn’t complete this request. Open the original link again or ask the sender for a new secret." },
  FORBIDDEN: { label: "ACCESS UNAVAILABLE", title: "This request isn’t allowed.", description: "Open the complete secret link directly in your browser to continue." },
  RATE_LIMITED: { label: "PLEASE WAIT", title: "A moment, please.", description: "Too many requests were made. Wait a little before trying again." },
  SERVICE_UNAVAILABLE: { label: "TEMPORARILY UNAVAILABLE", title: "We’ll need a moment.", description: "Secret storage is temporarily unavailable. Try checking your link again shortly." },
  INTERNAL_ERROR: { label: "REQUEST FAILED", title: "Something didn’t go to plan.", description: "We couldn’t complete this request. If you already confirmed a reveal, check the original link before trying again." },
};

function ViewerError({ code, canRetry = false }: { code: ViewerErrorCode; canRetry?: boolean }) {
  const content = ERROR_CONTENT[code];
  return (
    <section className="viewer-state" aria-live="polite">
      <div className="state-icon state-icon-large">{code === "MISSING_KEY" ? <KeyRound size={30} strokeWidth={1.2} /> : code === "SECRET_EXPIRED" ? <Hourglass size={29} strokeWidth={1.2} /> : <CircleSlash2 size={30} strokeWidth={1.2} />}</div>
      <span className="eyebrow">{content.label}</span>
      <h1>{content.title}</h1><p>{content.description}</p>
      {canRetry && <Button onClick={() => window.location.reload()}>Check link again <ArrowRight size={15} /></Button>}
      <Link href="/" className={canRetry ? "subtle-link" : "button button-primary"}>Create a secret <ArrowRight size={15} /></Link>
    </section>
  );
}

function AvailableSecret({ metadata, revealing, onReveal }: { metadata: SecretMetadata; revealing: boolean; onReveal: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const { expired } = useCountdown(metadata.expiresAt);
  if (expired && !revealing) return <ViewerError code="SECRET_EXPIRED" />;
  const single = metadata.remainingViews === 1;
  const accessLabel = metadata.remainingViews === null ? "UNLIMITED VIEWS" : `${metadata.remainingViews} ${single ? "VIEW" : "VIEWS"} REMAINING`;

  return (
    <>
      <div className="viewer-intro"><span className="status-pill"><span className="status-dot" />SECURE DELIVERY</span><h1>A secure secret<br /><span>is waiting.</span></h1><p>Someone shared something private with you.<br />Reveal it when you’re ready.</p></div>
      <section className="secret-card sealed-card">
        <div className="panel-heading"><span><LockKeyhole size={14} />SECRET AVAILABLE</span><span className="panel-encryption">AES-256-GCM</span></div>
        <div className="sealed-body"><div className="sealed-mark"><GhostMark /><span className="corner top-left" /><span className="corner top-right" /><span className="corner bottom-left" /><span className="corner bottom-right" /></div><h2>For your eyes only.</h2><p>{single ? "This is the final view. Once revealed, the encrypted secret is permanently deleted." : metadata.remainingViews === null ? "This secret is available until its expiration time." : `This secret has ${metadata.remainingViews} views remaining. Revealing it uses one view.`}</p><Button onClick={() => setConfirm(true)} busy={revealing}>{revealing ? "Decrypting locally…" : "Reveal secret"}{!revealing && <Eye size={17} />}</Button><span className="sealed-note"><ShieldCheck size={12} />Decrypted only in this browser</span></div>
        <div className="sealed-meta"><span><Eye size={13} />{accessLabel}</span><Countdown expiresAt={metadata.expiresAt} /></div>
      </section>
      <p className="viewer-footnote">Make sure you’re somewhere private before revealing.</p>
      <ConfirmDialog open={confirm} title="Ready to reveal this secret?" description={single ? "This uses the final view. The encrypted secret will be deleted immediately, so keep this page open until you’ve saved what you need." : "Revealing will use one view and decrypt the secret on this device. Make sure your screen is private."} confirmLabel="Reveal secret now" onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void onReveal(); }} />
    </>
  );
}

function RevealedSecret({ plaintext, consumed, metadata, onClear }: { plaintext: string; consumed: boolean; metadata: SecretMetadata; onClear: () => void }) {
  const clipboard = useClipboard();
  return (
    <>
      <div className="viewer-intro"><span className="status-pill"><Fingerprint size={12} />DECRYPTED LOCALLY</span><h1>Just between<br /><span>you and the sender.</span></h1><p>Your secret is ready. Keep it somewhere safe.</p></div>
      <section className="secret-card revealed-card">
        <div className="panel-heading"><span><KeyRound size={15} />YOUR SECRET</span><button className="text-button copy-secret" onClick={() => void clipboard.copy(plaintext)}>{clipboard.state === "copied" ? <Check size={13} /> : <Copy size={13} />}{clipboard.state === "copied" ? "Copied" : "Copy secret"}</button></div>
        <pre className="revealed-content" tabIndex={0} aria-label="Decrypted secret">{plaintext}</pre>
        <div className="reveal-receipt"><CheckCheck size={16} /><div><strong>{consumed ? "This secret has been consumed." : "Your secret was decrypted in this browser."}</strong><p>{consumed ? "The encrypted payload has been deleted from the active database." : metadata.remainingViews === null ? "The encrypted link stays available until it expires." : `${metadata.remainingViews} ${metadata.remainingViews === 1 ? "view remains" : "views remain"} before deletion.`}</p></div></div>
        <div className="revealed-actions"><Countdown expiresAt={metadata.expiresAt} /><Button variant="secondary" onClick={onClear}><EyeOff size={14} />Clear from screen</Button></div>
        {clipboard.state === "error" && <p className="form-error" role="alert">Clipboard access is unavailable. Select your secret and copy it manually.</p>}
      </section>
      <p className="viewer-footnote">Cleared from this page after 5 minutes, or sooner if it expires.<br />Copied text remains in your clipboard.</p>
      <Link href="/" className="subtle-link">Share a secret of your own <ArrowRight size={14} /></Link>
      <span className="sr-only" role="status">{clipboard.state === "copied" ? "Secret copied to clipboard." : ""}</span>
    </>
  );
}

export function RevealSecret({ id }: { id: string }) {
  const { state, reveal, clear } = useSecretViewer(id);
  return (
    <main className="viewer-main">
      {state.status === "loading" && <section className="viewer-state" role="status"><div className="state-icon state-icon-large"><LoaderCircle size={28} strokeWidth={1.5} className="spin" /></div><span className="eyebrow">CHECKING SECURE LINK</span><h1>A little privacy, please.</h1><p>Checking availability. Your secret stays sealed.</p></section>}
      {(state.status === "available" || state.status === "revealing") && <AvailableSecret metadata={state.metadata} revealing={state.status === "revealing"} onReveal={reveal} />}
      {state.status === "revealed" && <RevealedSecret plaintext={state.plaintext} consumed={state.consumed} metadata={state.metadata} onClear={clear} />}
      {state.status === "error" && <ViewerError code={state.code} canRetry={state.canRetry} />}
      {state.status === "cleared" && <section className="viewer-state" role="status"><div className="state-icon state-icon-large"><ShieldX size={30} strokeWidth={1.2} /></div><span className="eyebrow">SCREEN CLEARED</span><h1>A little less permanent.</h1><p>The secret has been removed from this page. Nothing was saved to browser storage.</p><Link href="/" className="button button-primary">Create a secret <ArrowRight size={15} /></Link></section>}
    </main>
  );
}

