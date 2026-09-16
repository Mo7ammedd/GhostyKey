"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="viewer-main"><section className="viewer-state"><span className="eyebrow">SOMETHING WENT WRONG</span><h1>Let’s try that again.</h1><p>We couldn’t load this page. Please try again.</p><Button onClick={reset}>Try again</Button></section></main>;
}
