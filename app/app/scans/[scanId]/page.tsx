import { LiveScanClient } from "./scan-client";

export default async function Page({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return <LiveScanClient scanId={scanId} />;
}
