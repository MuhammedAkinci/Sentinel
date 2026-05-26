import {
  createPublicClient,
  http,
  webSocket,
  type PublicClient,
} from "viem";

import { supportedChain } from "./wagmi";

/**
 * Server-side / build-time public client. Pure HTTP, used by RSC reads.
 */
export const httpClient: PublicClient = createPublicClient({
  chain: supportedChain,
  transport: http(supportedChain.rpcUrls.default.http[0]),
});

/**
 * Browser-only WSS client factory. Subscribes to Sentinel contract events.
 * Pointless on the server, so consumers gate it behind `typeof window`.
 */
export function createWssClient(): PublicClient {
  return createPublicClient({
    chain: supportedChain,
    transport: webSocket(supportedChain.rpcUrls.default.webSocket?.[0] ?? ""),
  });
}
