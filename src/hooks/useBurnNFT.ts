'use client';

import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplTokenMetadata,
  burnV1,
  fetchDigitalAsset,
  TokenStandard,
  findMetadataPda,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey, transactionBuilder } from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { NFT } from '@/types';
import bs58 from 'bs58';

/** Max burn instructions per Solana transaction (conservative to avoid size limit). */
const BURNS_PER_TX = 3;

interface MultiBurnResult {
  success: boolean;
  signatures: string[];
  burnedCount: number;
  error?: string;
}

export const useBurnNFT = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [burning, setBurning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [txSignatures, setTxSignatures] = useState<string[]>([]);

  /** Record burns + upgrade selections to the database (with retries). */
  async function recordBurns(
    walletAddress: string,
    burned: NFT[],
    upgradeTargets: NFT[],
    burnToSig: Map<string, string>,
    allSigs: string[],
  ): Promise<boolean> {
    const burns = burned.map((nft) => ({
      mintAddress: nft.mint,
      transactionSignature: burnToSig.get(nft.mint) || allSigs[0],
      name: nft.name,
    }));

    // Match each burned NFT to its upgrade target by index
    const upgrades = burned.map((burnNft, i) => ({
      burnedMint: burnNft.mint,
      upgradeMint: upgradeTargets[i]?.mint || '',
      upgradeName: upgradeTargets[i]?.name || '',
    }));

    let retries = 3;
    while (retries > 0) {
      try {
        const res = await fetch('/api/burn-and-upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, burns, upgrades }),
        });
        const result = await res.json();
        if (result.success) return true;
        throw new Error(result.error || 'Failed to record');
      } catch (e) {
        retries--;
        if (retries > 0) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return false;
  }

  const burnMultipleNFTs = useCallback(
    async (
      nftsToBurn: NFT[],
      upgradeTargets: NFT[],
    ): Promise<MultiBurnResult> => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        return { success: false, signatures: [], burnedCount: 0, error: 'Wallet not connected' };
      }

      setBurning(true);
      setError(null);
      setProgress({ current: 0, total: nftsToBurn.length });

      try {
        const umi = createUmi(connection.rpcEndpoint)
          .use(mplTokenMetadata())
          .use(walletAdapterIdentity(wallet));

        // ── 1. Fetch all assets and prepare burn params ──
        setStatus(`Preparing ${nftsToBurn.length} NFTs for burning…`);

        const burnItems: Array<{ nft: NFT; params: Parameters<typeof burnV1>[1] }> = [];

        for (const nft of nftsToBurn) {
          const mintPk = publicKey(nft.mint);
          let asset;
          try {
            asset = await fetchDigitalAsset(umi, mintPk);
          } catch {
            throw new Error(`NFT "${nft.name}" not found — it may have already been burned.`);
          }

          const tokenStandard = asset.metadata.tokenStandard ?? TokenStandard.NonFungible;

          const params: any = {
            mint: mintPk,
            authority: umi.identity,
            tokenOwner: umi.identity.publicKey,
            tokenStandard,
          };

          if (
            asset.metadata.collection &&
            asset.metadata.collection.__option === 'Some'
          ) {
            params.collectionMetadata = findMetadataPda(umi, {
              mint: asset.metadata.collection.value.key,
            })[0];
          }

          burnItems.push({ nft, params });
        }

        // ── 2. Batch burns into transactions ──
        const chunks: typeof burnItems[] = [];
        for (let i = 0; i < burnItems.length; i += BURNS_PER_TX) {
          chunks.push(burnItems.slice(i, i + BURNS_PER_TX));
        }

        const signatures: string[] = [];
        const burnToSignature = new Map<string, string>();
        const successfullyBurned: NFT[] = [];
        let burnedSoFar = 0;

        for (let ci = 0; ci < chunks.length; ci++) {
          const chunk = chunks[ci];
          setStatus(
            `Burning batch ${ci + 1}/${chunks.length} (${chunk.length} NFTs)… Approve in wallet`,
          );

          try {
            let builder = transactionBuilder();
            for (const { params } of chunk) {
              builder = builder.add(burnV1(umi, params));
            }

            const { signature: sig } = await builder.sendAndConfirm(umi, {
              confirm: { commitment: 'confirmed' },
            });
            const signature = bs58.encode(sig);
            signatures.push(signature);

            for (const { nft } of chunk) {
              burnToSignature.set(nft.mint, signature);
              successfullyBurned.push(nft);
            }

            burnedSoFar += chunk.length;
            setProgress({ current: burnedSoFar, total: nftsToBurn.length });
          } catch (batchErr: any) {
            // If some batches already succeeded, record them before surfacing the error
            if (successfullyBurned.length > 0) {
              setStatus(`Batch ${ci + 1} failed — recording ${successfullyBurned.length} already-burned NFTs…`);
              await recordBurns(
                wallet.publicKey!.toBase58(),
                successfullyBurned,
                upgradeTargets,
                burnToSignature,
                signatures,
              );
            }
            const partial = successfullyBurned.length > 0
              ? `${successfullyBurned.length} NFTs were burned and recorded. ${nftsToBurn.length - successfullyBurned.length} remaining NFTs were NOT burned.`
              : batchErr.message || 'Transaction failed';
            throw new Error(partial);
          }
        }

        // ── 3. Wait for finalization ──
        setStatus('Waiting for transaction finalization…');
        for (const sig of signatures) {
          try {
            await connection.confirmTransaction(sig, 'finalized');
          } catch {
            console.warn('Finalized confirmation timed out for', sig);
          }
        }

        // ── 4. Record burns + upgrades in database ──
        setStatus('Recording burns and upgrade selections…');

        const recorded = await recordBurns(
          wallet.publicKey.toBase58(),
          successfullyBurned,
          upgradeTargets,
          burnToSignature,
          signatures,
        );

        setTxSignatures(signatures);

        if (!recorded) {
          console.error('Failed to record burns after retries');
          setError(
            `NFTs burned on-chain but recording failed. Your transaction IDs: ${signatures.join(', ')}. Please contact support.`,
          );
          return {
            success: true,
            signatures,
            burnedCount: successfullyBurned.length,
            error: 'Recording failed',
          };
        }

        setStatus('✅ All NFTs burned and recorded successfully!');
        return { success: true, signatures, burnedCount: successfullyBurned.length };
      } catch (err: any) {
        const msg = err.message || 'Failed to burn NFTs';
        setError(msg);
        return { success: false, signatures: [], burnedCount: 0, error: msg };
      } finally {
        setBurning(false);
      }
    },
    [wallet, connection],
  );

  return { burnMultipleNFTs, burning, status, error, progress, txSignatures };
};
