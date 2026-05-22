"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

type RouteContext = {
  route: string;
  pageType: string;
  report?: Record<string, unknown>;
  finding?: Record<string, unknown>;
  latestProofTx?: string | null;
};

const canned = ["Explain this finding", "What is the L1 data fee?", "How do I generate a proof?"];
const storageKey = "archon-assistant-v1";

export function ArchonAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<RouteContext | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setMessages(JSON.parse(localStorage.getItem(storageKey) ?? "[]")); } catch { setMessages([]); }
  }, []);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20))); }, [messages]);
  useEffect(() => { if (open) void buildContext().then(setContext); }, [open]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const footerTx = useMemo(() => context?.latestProofTx ? `${context.latestProofTx.slice(0, 10)}…${context.latestProofTx.slice(-6)}` : "latest proof ready", [context]);

  async function submit(text = input) {
    const content = text.trim();
    if (!content || loading) return;
    setInput("");
    const routeContext = context ?? await buildContext();
    setContext(routeContext);
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setLoading(true);
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-10), context: routeContext }),
      });
      if (!response.ok || !response.body) throw new Error(`Assistant HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split("\n").find((part) => part.startsWith("data:"));
          if (!line) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { token?: string; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.token) {
              assistant += parsed.token;
              setMessages([...nextMessages, { role: "assistant", content: assistant }]);
            }
          } catch {
            // Ignore malformed heartbeat chunks.
          }
        }
      }
    } catch (error) {
      setMessages([...nextMessages, { role: "assistant", content: error instanceof Error ? `I could not stream a reply: ${error.message}` : "I could not stream a reply." }]);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button aria-label="Open Archon Assistant" onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-green-400/40 bg-green-400 text-canvas shadow-[0_0_0_0_rgba(63,217,138,0.35)] transition hover:scale-105 motion-safe:animate-pulse">
      <Bot size={24}/>
    </button>
    <div className={open ? "fixed bottom-24 right-6 z-50 h-[580px] w-[min(380px,calc(100vw-2rem))] origin-bottom-right scale-100 opacity-100 transition-all duration-300 ease-out" : "pointer-events-none fixed bottom-24 right-6 z-50 h-[580px] w-[min(380px,calc(100vw-2rem))] origin-bottom-right scale-90 opacity-0 transition-all duration-200 ease-in"}>
      <section className="flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-2xl shadow-black/40">
        <header className="flex items-start justify-between border-b border-border-subtle bg-surface-2 p-4">
          <div><p className="flex items-center gap-2 text-sm font-semibold text-text-hi"><Sparkles size={15} className="text-green-400"/> Archon Assistant</p><p className="mt-1 text-xs text-text-low">Contextual help for Mantle audit reports.</p></div>
          <button onClick={() => setOpen(false)} className="rounded-control border border-border-subtle p-1 text-text-low hover:text-text-hi"><X size={15}/></button>
        </header>
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4">
          {!messages.length ? <div className="space-y-3"><p className="rounded-card border border-border-subtle bg-terminal p-3 text-sm leading-6 text-text-mid">Ask about the page you are viewing. I can explain findings, proof status, Mantle context, and how to navigate Archon.</p><div className="flex flex-wrap gap-2">{canned.map((item) => <button key={item} onClick={() => submit(item)} className="rounded-pill border border-green-400/30 bg-green-400/10 px-3 py-1.5 text-xs text-green-400">{item}</button>)}</div></div> : null}
          {messages.map((message, index) => <div key={`${index}-${message.role}`} className={message.role === "user" ? "ml-8 rounded-card bg-green-400 px-3 py-2 text-sm text-canvas" : "mr-8 rounded-card border border-border-subtle bg-terminal px-3 py-2 text-sm leading-6 text-text-mid will-change-[opacity] animate-in fade-in"}>{message.content || <ThinkingDots/>}</div>)}
          {loading && messages.at(-1)?.content ? <ThinkingDots/> : null}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="border-t border-border-subtle p-3">
          <div className="flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this page…" className="min-w-0 flex-1 rounded-control border-border-subtle bg-terminal text-sm text-text-hi placeholder:text-text-low focus:border-green-400 focus:ring-green-400"/><button disabled={!input.trim() || loading} className="rounded-control bg-green-400 px-3 text-canvas disabled:opacity-40"><Send size={16}/></button></div>
          <p className="mt-2 text-center text-[11px] text-text-low">Archon Assistant · Mantle Mainnet · {footerTx}</p>
        </form>
      </section>
    </div>
  </>;
}

function ThinkingDots() { return <span className="inline-flex gap-1 p-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-low"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-low [animation-delay:120ms]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-low [animation-delay:240ms]"/></span>; }

async function buildContext(): Promise<RouteContext> {
  const route = window.location.pathname;
  const context: RouteContext = { route, pageType: pageType(route) };
  const reportMatch = route.match(/\/app\/reports\/([^/]+)/);
  if (reportMatch?.[1] && /^[0-9a-f-]{36}$/i.test(reportMatch[1])) {
    try {
      const res = await fetch(`/api/reports/${reportMatch[1]}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        context.report = data.report;
        const findingId = route.match(/\/findings\/([^/]+)/)?.[1];
        if (findingId) context.finding = data.findings?.find((finding: { id: string }) => finding.id === findingId) ?? null;
      }
    } catch {}
  }
  try {
    const proofs = await fetch("/api/proofs", { cache: "no-store" });
    if (proofs.ok) context.latestProofTx = (await proofs.json()).proofs?.find((proof: { txHash?: string }) => proof.txHash)?.txHash ?? null;
  } catch {}
  return context;
}

function pageType(route: string) {
  if (route.includes("/findings/")) return "finding-detail";
  if (route.endsWith("/tests")) return "generated-tests";
  if (route.includes("/reports/")) return "report";
  if (route.includes("/context")) return "contract-context-explorer";
  if (route.includes("/cost-guard")) return "cost-guard";
  if (route.includes("/proofs")) return "proofs";
  if (route.includes("/audit/new")) return "audit-studio";
  return "workspace";
}
