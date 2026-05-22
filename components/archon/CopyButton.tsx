"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className={`rounded border border-border-subtle p-1 text-text-low hover:text-green-400 ${className}`} title={copied ? "Copied" : "Copy"}><Copy size={12}/></button>;
}
