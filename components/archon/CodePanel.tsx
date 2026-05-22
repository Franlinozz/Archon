"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Copy, Maximize2, Minimize2 } from "lucide-react";
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
export function CodePanel({ code, language = "solidity", footer = "Solidity 0.8.24", height = 260 }: { code: string; language?: string; footer?: string; height?: number }) {
  const [fullscreen, setFullscreen] = useState(false);
  return <section className={fullscreen ? "fixed inset-4 z-50 overflow-hidden rounded-card border border-green-400/30 bg-terminal shadow-2xl" : "overflow-hidden rounded-card border border-border-subtle bg-terminal"}>
    <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-xs text-text-low"><span>Code panel</span><div className="flex gap-2"><button className="rounded-control border border-border-subtle p-1 text-text-mid hover:text-green-400" onClick={() => navigator.clipboard.writeText(code)} aria-label="Copy code"><Copy size={14}/></button><button className="rounded-control border border-border-subtle p-1 text-text-mid hover:text-green-400" onClick={() => setFullscreen((value) => !value)} aria-label="Fullscreen">{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button></div></div>
    <Editor height={fullscreen ? "calc(100vh - 112px)" : height} defaultLanguage={language} value={code} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: "on", fontFamily: "var(--font-mono)", fontSize: 13, automaticLayout: true }} />
    <div className="border-t border-border-subtle px-3 py-2 font-mono text-xs text-text-low">{footer}</div>
  </section>;
}
