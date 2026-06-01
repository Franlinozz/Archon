"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className={`rounded border border-border-subtle p-1 transition-colors ${copied ? "text-success" : "text-text-low hover:text-green-400"} ${className}`} title={copied ? "Copied" : "Copy"}>{copied ? <Check size={12} className="archon-pop"/> : <Copy size={12}/>}</button>;
}
