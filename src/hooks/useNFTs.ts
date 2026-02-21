'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { NFT } from '@/types';

const COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_COLLECTION_ADDRESS || '';

/**
 * Fetch NFTs via Helius DAS API (getAssetsByOwner).
 * Works with ALL asset types including MPL Core Assets.
 */
export const useNFTs = () => {
  const { connection } = useConnection();
  const { publicKey: walletPublicKey, connected } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedMints, setLockedMints] = useState<Set<string>>(new Set());

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

      // Use the Helius DAS API via the RPC endpoint
      const rpcEndpoint = connection.rpcEndpoint;
      let page = 1;
      let allItems: any[] = [];

      // Paginate through all assets
      while (true) {
        const response = await fetch(rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: walletPublicKey.toBase58(),
              page,
              limit: 1000,
              displayOptions: {
                showCollectionMetadata: false,
              },
            },
          }),
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'DAS API error');
        }

        const items = data.result?.items || [];
        allItems = allItems.concat(items);

        // If we got fewer than the limit, we've fetched everything
        if (items.length < 1000) break;
        page++;
      }

      console.log(`[useNFTs] Total assets from DAS API: ${allItems.length}`);

      const nftList: NFT[] = [];

      for (const item of allItems) {
        try {
          // Skip burned assets
          if (item.burnt) continue;

          // Filter by collection if specified
          if (COLLECTION_ADDRESS) {
            const grouping = item.grouping || [];
            const collectionGroup = grouping.find(
              (g: any) => g.group_key === 'collection'
            );

            if (!collectionGroup || collectionGroup.group_value !== COLLECTION_ADDRESS) {
              continue;
            }
          }

          const metadata = item.content?.metadata || {};
          const name = metadata.name || `NFT ${item.id.slice(0, 8)}`;
          const image =
            item.content?.links?.image ||
            item.content?.files?.[0]?.cdn_uri ||
            item.content?.files?.[0]?.uri ||
            '';
          const description = metadata.description || '';
          const attributes = metadata.attributes || [];

          nftList.push({
            mint: item.id,
            name: name.trim(),
            image,
            description,
            attributes,
          });
        } catch (err) {
          // Skip this individual NFT if there's an error
          console.warn('[useNFTs] Skipping asset:', item.id, err);
        }
      }

      console.log(`[useNFTs] Matched NFTs: ${nftList.length}`);
      setNfts(nftList);
    } catch (err: any) {
      console.error('[useNFTs] Error:', err);
      setError(err.message || 'Failed to fetch NFTs');
    } finally {
      setLoading(false);
    }
  }, [walletPublicKey, connected, connection.rpcEndpoint]);

  useEffect(() => {
    fetchNFTs();
  }, [fetchNFTs]);

  return { nfts, loading, lockedMints, refetch: fetchNFTs };
};