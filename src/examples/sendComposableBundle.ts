import {
  JsonRpcProvider,
  TransactionRequest,
  Wallet,
  hexlify,
  keccak256,
  toBigInt,
  toUtf8Bytes,
} from "ethers";

// lib
import MevShareClient, { BundleParams } from "..";
import { getProvider, initExample } from "./lib/helpers";
import env from "./lib/env";

const NUM_TARGET_BLOCKS = 20;

/** Send a bundle that shares as much data as possible by setting the `privacy` param. */
const sendTestBundle = async (
  provider: JsonRpcProvider,
  mevshare: MevShareClient,
  wallet: Wallet,
  targetBlock: number
) => {
  const feeData = await provider.getFeeData();
  // Use base fee from network
  const baseFee = toBigInt(feeData.maxFeePerGas || 42);
  const priorityFee = toBigInt(feeData.maxPriorityFeePerGas || 2);
  
  // Add smaller tips
  const maxPriorityFeePerGas = priorityFee + BigInt(1e9); // Add 1 gwei priority fee
  const maxFeePerGas = baseFee + maxPriorityFeePerGas; // Base fee + priority fee
  
  const tx: TransactionRequest = {
    type: 2,
    chainId: provider._network.chainId,
    to: wallet.address,
    nonce: await wallet.getNonce(),
    value: 0,
    gasLimit: 22000,
    data: hexlify(toUtf8Bytes("im shariiiiiing")),
    maxFeePerGas,
    maxPriorityFeePerGas,
  };

  const bundle = [{ tx: await wallet.signTransaction(tx), canRevert: false }];
  const bundleParams: BundleParams = {
    inclusion: {
      block: targetBlock,
      maxBlock: targetBlock + NUM_TARGET_BLOCKS,
    },
    body: bundle,
    privacy: {
      hints: {
        txHash: true,
        calldata: true,
        logs: true,
        functionSelector: true,
        contractAddress: true,
      },
      builders: ["flashbots"],
    },
  };

  // Simulate before sending
  console.log("Simulating bundle...");
  try {
    const simResult = await mevshare.simulateBundle(bundleParams);
    console.log("Simulation successful:", simResult);
    // Here you could add checks for expected profit/outcome
    if (!simResult.success) {
      throw new Error(`Simulation failed: ${simResult}`);
    }
  } catch (error) {
    console.error("Simulation failed:", error);
    throw error;
  }

  // Only send if simulation was successful
  console.log(`sending bundle targeting block ${targetBlock}...`);
  const backrunResult = await mevshare.sendBundle(bundleParams);

  // Get the transaction hash from the signed transaction
  const signedTx = bundle[0].tx;
  const txHash = keccak256(signedTx);

  // Monitor for inclusion
  console.log(`Monitoring transaction ${txHash} for inclusion...`);
  for (let i = 0; i < NUM_TARGET_BLOCKS; i++) {
    const currentBlock = targetBlock + i;

    // Wait for the target block
    while ((await provider.getBlockNumber()) < currentBlock) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Check if transaction was included
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      console.log(`Bundle included in block ${receipt.blockNumber}!`);
      console.log(
        `Transaction status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`
      );

      // Simulate the bundle
      const simResult = await mevshare.simulateBundle(bundleParams, {
        parentBlock: receipt.blockNumber - 1,
      });
      console.log("Simulation result:", simResult);

      return {
        bundleParams,
        backrunResult,
        receipt,
        simResult,
      };
    }

    console.log(
      `Not included in block ${currentBlock}, continuing to monitor...`
    );
  }

  console.log("Bundle was not included within the target block range");
  return {
    bundleParams,
    backrunResult,
  };
};

const main = async () => {
  const provider = getProvider();
  const { mevshare } = await initExample(provider);

  const targetBlock = (await provider.getBlockNumber()) + 1;
  const wallet = new Wallet(env.senderKey, provider);
  const { bundleParams, backrunResult } = await sendTestBundle(
    provider,
    mevshare,
    wallet,
    targetBlock
  );
  console.log("bundleParams", bundleParams);
  console.log("backrunResult", backrunResult);
};

main().then(() => {
  process.exit(0);
});
