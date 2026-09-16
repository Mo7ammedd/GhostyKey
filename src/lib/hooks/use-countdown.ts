"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const interval = setInterval(callback, 1_000);
  return () => clearInterval(interval);
}
const snapshot = () => Math.floor(Date.now() / 1_000);
const serverSnapshot = () => 0;

export function useCountdown(expiresAt: string) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const remaining = Math.max(0, Math.ceil(new Date(expiresAt).getTime() / 1_000) - now);
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const seconds = remaining % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    expired: now > 0 && remaining === 0,
    label: now === 0 ? "--:--:--" : `${days > 0 ? `${days}d ` : ""}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

