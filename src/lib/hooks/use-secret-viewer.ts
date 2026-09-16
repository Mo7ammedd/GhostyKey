"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { decryptSecret, importDecryptionKey } from "@/lib/crypto/client";
import { consumeEncryptedSecret, getSecretMetadata } from "@/lib/secrets/client";
import { SecretError, type SecretErrorCode } from "@/lib/secrets/errors";
import { encryptionKeySchema, secretIdSchema } from "@/lib/validation/secrets";
import type { SecretMetadata } from "@/types/secrets";

export type ViewerErrorCode = SecretErrorCode | "MISSING_KEY" | "DECRYPTION_FAILED" | "NETWORK_ERROR" | "CRYPTO_UNAVAILABLE";
type ViewerState =
  | { status: "loading" }
  | { status: "available" | "revealing"; metadata: SecretMetadata }
  | { status: "revealed"; plaintext: string; metadata: SecretMetadata; consumed: boolean }
  | { status: "error"; code: ViewerErrorCode; canRetry?: boolean }
  | { status: "cleared" };

function removeFragment() {
  window.history.replaceState(window.history.state, "", window.location.pathname);
}

export function useSecretViewer(id: string) {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const cryptoKey = useRef<CryptoKey | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current += 1;
    cryptoKey.current = null;
    removeFragment();
    setState({ status: "cleared" });
  }, []);

  useEffect(() => {
    function onHashChange() {
      setState({ status: "loading" });
      setRevision((value) => value + 1);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const currentGeneration = ++generation.current;
    const isCurrent = () => !controller.signal.aborted && generation.current === currentGeneration;

    async function initialize() {
      if (!secretIdSchema.safeParse(id).success) {
        setState({ status: "error", code: "INVALID_SECRET_ID" });
        return;
      }
      const encodedKey = window.location.hash.slice(1);
      if (!encryptionKeySchema.safeParse(encodedKey).success) {
        setState({ status: "error", code: "MISSING_KEY" });
        return;
      }
      if (!window.crypto?.subtle) {
        setState({ status: "error", code: "CRYPTO_UNAVAILABLE" });
        return;
      }
      try {
        const key = await importDecryptionKey(encodedKey);
        const metadata = await getSecretMetadata(id, controller.signal);
        if (isCurrent()) {
          cryptoKey.current = key;
          setState({ status: "available", metadata });
        }
      } catch (error) {
        if (isCurrent()) {
          const code = error instanceof SecretError ? error.code : "NETWORK_ERROR";
          setState({ status: "error", code, canRetry: ["NETWORK_ERROR", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR"].includes(code) });
        }
      }
    }

    void initialize();
    const onPageHide = () => flushSync(clear);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      controller.abort();
      generation.current += 1;
      cryptoKey.current = null;
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [id, clear, revision]);

  useEffect(() => {
    if (state.status !== "revealed") return;
    // Keep plaintext only in this page's memory, for at most five minutes.
    const duration = Math.max(0, Math.min(300_000, new Date(state.metadata.expiresAt).getTime() - Date.now()));
    const timer = setTimeout(clear, duration);
    return () => clearTimeout(timer);
  }, [state, clear]);

  async function reveal() {
    if (inFlight.current || state.status !== "available" || !cryptoKey.current) return;
    if (new Date(state.metadata.expiresAt).getTime() <= Date.now()) {
      setState({ status: "error", code: "SECRET_EXPIRED" });
      return;
    }
    inFlight.current = true;
    const currentGeneration = generation.current;
    const key = cryptoKey.current;
    setState({ status: "revealing", metadata: state.metadata });
    let receivedPayload = false;
    try {
      const payload = await consumeEncryptedSecret(id);
      receivedPayload = true;
      const plaintext = await decryptSecret(payload.ciphertext, payload.iv, key);
      if (generation.current === currentGeneration) {
        setState({
          status: "revealed", plaintext, consumed: payload.consumed,
          metadata: { expiresAt: payload.expiresAt, maxViews: payload.maxViews, viewCount: payload.viewCount, remainingViews: payload.remainingViews },
        });
      }
    } catch (error) {
      if (generation.current === currentGeneration) {
        setState({ status: "error", code: error instanceof SecretError ? error.code : receivedPayload ? "DECRYPTION_FAILED" : "NETWORK_ERROR" });
      }
    } finally {
      if (generation.current === currentGeneration) {
        cryptoKey.current = null;
        removeFragment();
      }
      inFlight.current = false;
    }
  }

  return { state, reveal, clear };
}
