"use client";

import { useState, useEffect, useRef } from "react";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  title: string;
  author: string;
  url: string;
}

export default function ShareButton({ title, author, url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleShare = async () => {
    const text = `Se hvad ${author} har bygget på vibetrends.dk: ${title}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url, text });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          await copyToClipboard();
        }
      }
    } else {
      await copyToClipboard();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — silently ignore
    }
  };

  return (
    <button
      onClick={handleShare}
      aria-label={copied ? "Link kopieret!" : "Del projekt"}
      className="p-3 rounded-lg bg-background border border-card-border text-foreground hover:bg-card-border transition-colors relative"
    >
      <Share2 className="h-5 w-5" />
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-semibold bg-foreground text-background px-2 py-1 rounded whitespace-nowrap pointer-events-none">
          Link kopieret!
        </span>
      )}
    </button>
  );
}
