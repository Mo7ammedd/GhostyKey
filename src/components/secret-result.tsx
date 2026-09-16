"use client";

import { useState } from "react";
import { ArrowRight, Check, CheckCheck, Copy, Eye, Link2, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Countdown } from "@/components/ui/countdown";
import { useClipboard } from "@/lib/hooks/use-clipboard";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { revokeSecret } from "@/lib/secrets/client";
import { SecretError } from "@/lib/secrets/errors";
import type { SecretResult as SecretResultData } from "@/types/secrets";

export function SecretResult({ result, onReset }: { result: SecretResultData; onReset: () => void }) {
  const clipboard = useClipboard();
  const { expired } = useCountdown(result.expiresAt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await revokeSecret(result.id, result.deletionToken);
      setDeleted(true);
    } catch (caught) {
      setError(caught instanceof SecretError ? caught.message : "Couldn’t delete the secret. Check your connection and try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (deleted || expired) return (
    <div className="secret-card result-card completed-state" role="status">
      <div className="state-icon"><Trash2 size={25} strokeWidth={1.5} /></div>
      <span className="eyebrow">{deleted ? "SECRET DELETED" : "SECRET EXPIRED"}</span>
      <h2>{deleted ? "Gone. Just like that." : "Time’s up."}</h2>
      <p>{deleted ? "Your link is no longer available. Its encrypted contents have been deleted." : "This link has expired and can no longer be opened."}</p>
      <Button onClick={onReset}>Create another secret <ArrowRight size={15} /></Button>
    </div>
  );

  return (
    <div className="create-shell">
      <section className="secret-card result-card" aria-label="Secret created">
        <div className="panel-heading"><span><CheckCheck size={15} />SECRET CREATED</span><span className="panel-encryption"><LockKeyhole size={11} />READY TO SHARE</span></div>
        <div className="result-body">
          <div className="result-title"><div className="state-icon"><Link2 size={24} strokeWidth={1.5} /></div><div><h2>A secret worth keeping.</h2><p>Send this link to someone you trust.</p></div></div>
          <label htmlFor="secure-link" className="eyebrow link-label">YOUR SECURE LINK</label>
          <div className="secure-link-field"><Link2 size={16} /><input id="secure-link" aria-label="Secure link" type="text" readOnly value={result.url} spellCheck={false} autoComplete="off" onFocus={(event) => event.currentTarget.select()} /></div>
          <Button onClick={() => void clipboard.copy(result.url)} className="copy-link-button">{clipboard.state === "copied" ? <Check size={16} /> : <Copy size={16} />}{clipboard.state === "copied" ? "Link copied" : "Copy secure link"}</Button>
          <p className="result-warning">{result.maxViews === 1 ? "This link can only be viewed once." : result.maxViews === 0 ? "This link can be viewed until it expires." : `This link allows ${result.maxViews} views.`} Keep the complete link safe.</p>
          {clipboard.state === "error" && <p className="form-error" role="alert">Clipboard access is unavailable. Select the link above and copy it manually.</p>}
        </div>
        <div className="result-meta"><span><Eye size={13} />{result.maxViews === 0 ? "UNLIMITED VIEWS" : `${result.maxViews} ${result.maxViews === 1 ? "VIEW" : "VIEWS"}`}</span><Countdown expiresAt={result.expiresAt} /><button className="text-button" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Delete secret</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <div className="result-caption"><span>You can delete this secret while this page stays open.</span><button className="text-button" onClick={onReset}><Plus size={14} />Create another</button></div>
      <ConfirmDialog open={confirmDelete} title="Delete this secret?" description="The encrypted payload will be permanently removed. Anyone with the link will no longer be able to reveal it." confirmLabel="Delete secret" busy={deleting} onClose={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
      <span className="sr-only" role="status">{clipboard.state === "copied" ? "Secure link copied to clipboard." : ""}</span>
    </div>
  );
}
