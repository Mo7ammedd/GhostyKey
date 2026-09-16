import type { Metadata } from "next";
import { RevealSecret } from "@/components/reveal-secret";

export const metadata: Metadata = {
  title: "A secure secret is waiting",
  description: "A private, encrypted secret has been shared with you.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function SecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RevealSecret key={id} id={id} />;
}

