'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { 
  mplTokenMetadata,
  fetchAllDigitalAssetWithTokenByOwner,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { NFT } from '@/types';

// Fetch metadata from URI
async function fetchMetadata(uri: string): Promise<any> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(uri, { 
      signal: controller.signal,
      cache: 'force-cache' 
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    // Silently fail for metadata - we'll use on-chain data
    return null;
  }
}

const COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_COLLECTION_ADDRESS || '';

export const useNFTs = () => {
  const { connection } = useConnection();
  const { publicKey: walletPublicKey, connected } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMints, setLockedMints] = useState<Set<string>>(new Set());

  // Memoize UMI — recreated only when the RPC endpoint changes
  const umi = useMemo(
    () => createUmi(connection.rpcEndpoint).use(mplTokenMetadata()),
    [connection.rpcEndpoint]
  );

  const fetchNFTs = useCallback(async () => {
    if (!walletPublicKey || !connected) {
      setNfts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch mints that are locked (already selected as upgrade targets)
      try {
        const res = await fetch(`/api/locked-mints?wallet=${walletPublicKey.toBase58()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.lockedMints)) {
            setLockedMints(new Set(data.lockedMints));
          }
        }
      } catch {
        // Non-critical — continue without locked mints info
      }

      const assets = await fetchAllDigitalAssetWithTokenByOwner(
        umi,
        publicKey(walletPublicKey.toBase58())
      );

      const nftList: NFT[] = [];

      console.log(`[useNFTs] Total assets from wallet: ${assets.length}`);
      console.log(`[useNFTs] COLLECTION_ADDRESS filter: "${COLLECTION_ADDRESS}"`);

      for (const asset of assets) {
        try {
          // Only process NFTs (decimals = 0, amount = 1)
          if (asset.token.amount !== BigInt(1) || asset.mint.decimals !== 0) {
            console.log(`[useNFTs] SKIP (not NFT): ${asset.publicKey.toString()} — amount=${asset.token.amount}, decimals=${asset.mint.decimals}`);
            continue;
          }

          const metadata = asset.metadata;
          
          // Filter by collection if specified
          if (COLLECTION_ADDRESS) {
            console.log(`[useNFTs] Checking NFT: ${metadata.name} | mint: ${asset.publicKey.toString()}`);
            console.log(`[useNFTs]   collection field:`, JSON.stringify(metadata.collection));

            // Handle UMI Option type — can be { __option: 'Some', value: {...} }
            // or directly { key, verified } depending on version
            let collectionKey: string | null = null;
            let collectionVerified = false;

            if (!metadata.collection) {
              console.log(`[useNFTs]   SKIP: no collection field`);
              continue;
            }

            const col = metadata.collection as any;

            if (col.__option === 'None') {
              console.log(`[useNFTs]   SKIP: collection __option is None`);
              continue;
            } else if (col.__option === 'Some' && col.value) {
              // Standard UMI Option: { __option: 'Some', value: { key, verified } }
              collectionKey = col.value.key?.toString();
              collectionVerified = col.value.verified;
            } else if (col.key) {
              // Direct access (some UMI versions)
              collectionKey = col.key.toString();
              collectionVerified = col.verified;
            }

            console.log(`[useNFTs]   collectionKey: ${collectionKey}, verified: ${collectionVerified}`);

            if (!collectionKey) {
              console.log(`[useNFTs]   SKIP: could not extract collection key`);
              continue;
            }

            if (collectionKey !== COLLECTION_ADDRESS) {
              console.log(`[useNFTs]   SKIP: collection mismatch (${collectionKey} !== ${COLLECTION_ADDRESS})`);
              continue;
            }

            if (!collectionVerified) {
              console.log(`[useNFTs]   SKIP: collection not verified`);
              continue;
            }
          }

          let name = metadata.name || 'Unknown NFT';
          let image = '';
          let description = '';
          let attributes: Array<{ trait_type: string; value: string }> = [];

          // Fetch off-chain metadata if URI exists
          if (metadata.uri) {
            try {
              const offChainMetadata = await fetchMetadata(metadata.uri);
              if (offChainMetadata) {
                name = offChainMetadata.name || name;
                image = offChainMetadata.image || '';
                description = offChainMetadata.description || '';
                attributes = offChainMetadata.attributes || [];
              }
            } catch (e) {
              // Silently use on-chain data only
            }
          }

          // Always add the NFT even if metadata fetch failed
          nftList.push({
            mint: asset.publicKey.toString(),
            name: name.trim() || `NFT ${asset.publicKey.toString().slice(0, 8)}`,
            image,
            description,
            attributes,
          });
        } catch (err) {
          // Skip this individual NFT if there's an error
        }
      }

      setNfts(nftList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch NFTs');
    } finally {
      setLoading(false);
    }
  }, [walletPublicKey, connected, umi]);

  useEffect(() => {
    fetchNFTs();
  }, [fetchNFTs]);

  return { nfts, loading, lockedMints, refetch: fetchNFTs };
};