import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mantleMainnet } from "./mantle";

export const wagmiConfig = createConfig({
  chains: [mantleMainnet],
  connectors: [injected()],
  ssr: true,
  transports: {
    [mantleMainnet.id]: http(process.env.NEXT_PUBLIC_MANTLE_RPC_URL ?? "https://rpc.mantle.xyz"),
  },
});
