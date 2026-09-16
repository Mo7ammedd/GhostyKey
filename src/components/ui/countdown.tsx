"use client";

import { Clock3 } from "lucide-react";
import { useCountdown } from "@/lib/hooks/use-countdown";

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const { label, expired } = useCountdown(expiresAt);
  return <span className="countdown"><Clock3 size={13} aria-hidden="true" /><time dateTime={expiresAt} title={`Expires ${new Date(expiresAt).toUTCString()}`}>{expired ? "Expired" : label}</time></span>;
}

