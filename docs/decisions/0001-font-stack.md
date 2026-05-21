# ADR 0001: Font stack

Status: accepted

Decision: Use self-hosted Space Grotesk Bold for display, Inter for UI, and JetBrains Mono for code/data via `next/font/local` files under `app/fonts/`.

Reason: General Sans/Clash were preferred examples, but Space Grotesk is an available heavy geometric grotesk that preserves the Obsidian intent without hot-linking a CDN. Inter and JetBrains Mono match the locked UI/mono guidance.
