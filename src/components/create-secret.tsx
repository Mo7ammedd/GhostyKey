"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, ChevronDown, Clock3, Eye, FileLock2, LockKeyhole, ShieldCheck, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SecretResult } from "@/components/secret-result";
import { createSecureLink } from "@/lib/secrets/client";
import { DEFAULT_EXPIRATION_SECONDS, EXPIRATION_OPTIONS, MAX_SECRET_BYTES, VIEW_OPTIONS } from "@/lib/secrets/constants";
import { SecretError } from "@/lib/secrets/errors";
import type { SecretResult as SecretResultData } from "@/types/secrets";

export function CreateSecret() {
  const [secret, setSecret] = useState("");
  const [expiration, setExpiration] = useState(String(DEFAULT_EXPIRATION_SECONDS));
  const [customMinutes, setCustomMinutes] = useState("60");
  const [maxViews, setMaxViews] = useState(1);
  const [phase, setPhase] = useState<"idle" | "encrypting">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SecretResultData | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  const bytes = new TextEncoder().encode(secret).length;
  const tooLarge = bytes > MAX_SECRET_BYTES;
  const busy = phase !== "idle";

  useEffect(() => {
    function onPageHide() {
      generation.current += 1;
      flushSync(() => { setSecret(""); setResult(null); setError(""); });
    }
    window.addEventListener("pagehide", onPageHide);
    return () => { generation.current += 1; window.removeEventListener("pagehide", onPageHide); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (bytes === 0) { setError("Add a secret before creating a link."); textarea.current?.focus(); return; }
    if (tooLarge) { setError("Your secret is too large. Keep it under 1 MB."); return; }
    const expiresIn = expiration === "custom" ? Number(customMinutes) * 60 : Number(expiration);
    if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 2_592_000) {
      setError("Choose a duration between 1 minute and 30 days."); return;
    }

    submitting.current = true;
    const currentGeneration = generation.current;
    setPhase("encrypting");
    try {
      const created = await createSecureLink(secret, expiresIn, maxViews);
      if (generation.current === currentGeneration) {
        setSecret("");
        setResult(created);
      }
    } catch (caught) {
      if (generation.current === currentGeneration) {
        setError(caught instanceof SecretError ? caught.message : "We couldn’t create your link. Check your connection and try again.");
      }
    } finally {
      submitting.current = false;
      setPhase("idle");
    }
  }

  if (result) return <SecretResult result={result} onReset={() => { setResult(null); setError(""); }} />;

  return (
    <div className="create-shell">
      <form className="secret-card" onSubmit={submit} autoComplete="off">
        <div className="panel-heading"><span><Terminal size={15} strokeWidth={1.6} />NEW SECRET</span><span className="panel-encryption"><LockKeyhole size={11} />END-TO-END ENCRYPTED</span></div>
        <div className="editor-area">
          <label htmlFor="secret-payload" className="sr-only">Your secret</label>
          <textarea ref={textarea} id="secret-payload" className="secret-input" value={secret} onChange={(event) => setSecret(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
            placeholder={"Paste a password, an API key, or something private…"} spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
            data-1p-ignore="true" data-lpignore="true" disabled={busy} aria-describedby="secret-help secret-size" aria-invalid={tooLarge} />
          <div className="editor-bottom"><span id="secret-help"><LockKeyhole size={11} />Only you and your recipient can read this.</span><span id="secret-size" className={tooLarge ? "over-limit" : ""}>{bytes === 0 ? "0 B" : bytes < 1_024 ? `${bytes} B` : `${(bytes / 1_024).toFixed(1)} KB`}<span className="size-divider">/</span>1 MB</span></div>
        </div>
        <div className="composer-toolbar">
          <div className="setting-field">
            <label htmlFor="expiration"><Clock3 size={12} />EXPIRES AFTER</label>
            <div className="select-wrap"><select id="expiration" value={expiration} onChange={(event) => setExpiration(event.target.value)} disabled={busy}>{EXPIRATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={13} /></div>
          </div>
          <div className="setting-field views-field">
            <label htmlFor="max-views"><Eye size={13} />MAX VIEWS</label>
            <div className="select-wrap"><select id="max-views" value={maxViews} onChange={(event) => setMaxViews(Number(event.target.value))} disabled={busy}>{VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={13} /></div>
          </div>
          <Button type="submit" className="create-button" busy={busy} disabled={tooLarge}>{busy ? "Encrypting…" : "Create secret"}{!busy && <ArrowRight size={16} />}</Button>
        </div>
        {expiration === "custom" && <div className="custom-expiration"><label htmlFor="custom-minutes">Custom duration</label><div><input id="custom-minutes" type="number" min="1" max="43200" step="1" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} disabled={busy} required /><span>minutes</span></div><span>1 minute to 30 days</span></div>}
        {error && <div className="form-error" role="alert"><ShieldCheck size={15} />{error}</div>}
      </form>
      <div className="composer-caption"><span><FileLock2 size={13} />Encrypted in your browser. Shared on your terms.</span><span className="keyboard-hint"><kbd>Ctrl</kbd><kbd>↵</kbd> to create</span></div>
      <noscript><p className="form-error">JavaScript is required to encrypt secrets in your browser.</p></noscript>
    </div>
  );
}
