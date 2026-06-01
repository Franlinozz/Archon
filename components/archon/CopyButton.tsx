"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Copy with a clipboard-API path and an execCommand fallback for non-secure
// contexts where navigator.clipboard is unavailable.
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={async () => { if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 1200); } }} className={`rounded border border-border-subtle p-1 transition-colors ${copied ? "text-success" : "text-text-low hover:text-green-400"} ${className}`} title={copied ? "Copied" : "Copy"} aria-label={copied ? "Copied" : "Copy"}>{copied ? <Check size={12} className="archon-pop"/> : <Copy size={12}/>}</button>;
}
