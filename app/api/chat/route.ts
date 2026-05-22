import { z } from "zod";

const MODEL = "gpt-4o-mini";

const messageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });
const requestSchema = z.object({ messages: z.array(messageSchema).min(1).max(12), context: z.unknown().optional() });

const appendixCPrompt = `You are Archon Assistant, the in-product helper for Archon DevTools - an
AI-powered, ERC-8004 trustless smart-contract auditor native to Mantle Mainnet.

You help developers and hackathon judges understand Archon's outputs, navigate
the product, and learn about Mantle.

PERSONALITY
- Calm, precise, expert. You sound like a senior security engineer who is
  unusually good at explaining things clearly.
- You never hype. No crypto-bro language. No emoji.
- You are direct. If something is risky, you say so. If it is fine, you say so.

KNOWLEDGE
- You know the Archon product surface: the ten routes and what each does, the
  seven-stage scan pipeline, what the findings and the risk score mean.
- You know Mantle Mainnet basics: chain ID 5000, native token MNT, the
  L1-data-fee + L2-execution-fee cost model, and the major protocols
  (mETH, cmETH, USDY, Aave, Merchant Moe, Agni).
- You know ERC-8004 basics: Identity, Reputation, and Validation registries,
  and why Archon uses them to make audits verifiable and challengeable.
- The user message includes the current page's context, so you can speak to the
  specific scan, report, or finding the user is looking at.

BOUNDARIES
- You do NOT start scans, connect wallets, or send transactions. You explain;
  the user clicks.
- You do NOT speculate on token prices or give investment advice.
- You do NOT generate unaudited production code; illustrative snippets only.
- Off-topic (other chains, unrelated subjects) - redirect politely to Archon
  and Mantle.

FORMAT
- Short and scannable. Default to 2-4 sentences.
- For technical points, at most 2-3 bullets.
- Reference findings, pages, or sections by name when relevant.

CURRENT PAGE CONTEXT
{contextJson}`;

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid chat request", { status: 400 });
  const contextJson = JSON.stringify(parsed.data.context ?? { route: "unknown" }, null, 2).slice(0, 6000);
  const system = appendixCPrompt.replace("{contextJson}", contextJson);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 10_000);
      try {
        if (process.env.OPENAI_API_KEY) {
          await streamOpenAI(system, parsed.data.messages, send);
        } else {
          await streamFallback(parsed.data.messages.at(-1)?.content ?? "", parsed.data.context, send);
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Assistant stream failed" });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

async function streamOpenAI(system: string, messages: Array<{ role: "user" | "assistant"; content: string }>, send: (value: unknown) => void) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.2, stream: true, messages: [{ role: "system", content: system }, ...messages] }),
  });
  if (!response.ok || !response.body) throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((part) => part.startsWith("data:"));
      const data = line?.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) send({ token });
    }
  }
}

async function streamFallback(userMessage: string, context: unknown, send: (value: unknown) => void) {
  const ctx = context as { pageType?: string; finding?: { title?: string; severity?: string; whyMantle?: string; summary?: string; recommendedFix?: string }; report?: { contractName?: string; riskScore?: number } } | undefined;
  const lower = userMessage.toLowerCase();
  let reply: string;
  if (/price|invest|buy|sell|token price/.test(lower)) {
    reply = "I cannot discuss token prices or investment advice. In Archon, I can explain Mantle audit findings, report proofs, and how to read the product surfaces.";
  } else if (/start|run|scan|connect|send|transaction|wallet/.test(lower) && /can you|please|do it|start|run|connect|send/.test(lower)) {
    reply = "I cannot start scans, connect wallets, or send transactions. I can explain which button to use and what to review before you take the action yourself.";
  } else if (ctx?.finding) {
    reply = `${ctx.finding.title} is a ${ctx.finding.severity} finding on this report. ${ctx.finding.whyMantle ?? ctx.finding.summary ?? "It matters because the affected path can change contract safety or cost assumptions on Mantle."} Recommended next step: ${ctx.finding.recommendedFix ?? "review the highlighted code and generate a regression test."}`;
  } else if (ctx?.report) {
    reply = `This report is for ${ctx.report.contractName ?? "the selected contract"} with risk score ${ctx.report.riskScore ?? "not shown"}. Use the findings table for line-level issues, Generated Tests for regression coverage, and On-chain Proof to verify the report hash.`;
  } else if (lower.includes("l1 data fee")) {
    reply = "Mantle transaction cost has L2 execution cost plus an L1 data component for publishing compressed transaction data. Archon flags patterns where calldata size, repeated writes, or unbounded loops can make that cost harder to predict.";
  } else if (lower.includes("proof")) {
    reply = "To generate a proof, open a completed report and use Generate Proof. Archon hashes the report metadata, pins it to IPFS, and records a Reputation entry for Archon's ERC-8004 identity on Mantle Mainnet.";
  } else {
    reply = "Archon is a Mantle-native audit agent. I can explain findings, report risk, generated tests, context explorer results, and ERC-8004 proof verification for the page you are viewing.";
  }
  for (const token of reply.match(/.{1,18}(?:\s|$)/g) ?? [reply]) {
    send({ token });
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}
