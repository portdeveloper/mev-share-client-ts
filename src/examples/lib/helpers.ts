import { JsonRpcProvider, Wallet } from "ethers";
import MevShareClient from "../..";
import Env from "./env";
import networks from "../../api/networks";

export function getProvider() {
  return new JsonRpcProvider(Env.providerUrl, networks.sepolia);
}

/** Initializes MEV-Share client with specified wallet on Sepolia. */
export async function initMevShareClient(provider: JsonRpcProvider) {
  const authSigner = new Wallet(Env.authKey).connect(provider);

  return {
    mevshare: MevShareClient.useEthereumSepolia(authSigner),
  };
}
