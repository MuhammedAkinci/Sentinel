import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannonTestnet, somniaMainnet, type SomniaChain } from "@sentinel/shared/chains";

export interface RpcConfig {
  chainId: number;
  httpUrl: string;
  wssUrl: string;
}

function resolveChain(chainId: number): SomniaChain {
  if (chainId === somniaShannonTestnet.id) return somniaShannonTestnet;
  if (chainId === somniaMainnet.id) return somniaMainnet;
  throw new Error(`Unsupported chain id ${chainId} (expected ${somniaShannonTestnet.id} or ${somniaMainnet.id})`);
}

export function createHttpReader(cfg: RpcConfig): PublicClient {
  return createPublicClient({
    chain: resolveChain(cfg.chainId),
    transport: http(cfg.httpUrl),
  });
}

export function createWssReader(cfg: RpcConfig): PublicClient {
  return createPublicClient({
    chain: resolveChain(cfg.chainId),
    transport: webSocket(cfg.wssUrl),
  });
}

export function createSigner(cfg: RpcConfig, privateKey: Hex): WalletClient {
  return createWalletClient({
    chain: resolveChain(cfg.chainId),
    transport: http(cfg.httpUrl),
    account: privateKeyToAccount(privateKey),
  });
}
