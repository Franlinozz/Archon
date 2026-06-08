import { ApiReference } from "@scalar/nextjs-api-reference";

export const dynamic = "force-static";

export const GET = ApiReference({
  pageTitle: "Archon API Reference",
  url: "/api/openapi",
  theme: "moon",
  layout: "modern",
  hideDownloadButton: false,
  hideModels: false,
  defaultHttpClient: {
    targetKey: "shell",
    clientKey: "curl",
  },
  metaData: {
    title: "Archon API Reference",
    description: "OpenAPI reference for Archon's Mantle audit, gas optimization, and proof APIs.",
  },
});
