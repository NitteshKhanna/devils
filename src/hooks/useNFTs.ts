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

// Convert IPFS URI to HTTP gateway URL
const convertIpfsUri = (uri: string): string => {
  if (!uri) return '';
  
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${cid}`;
  }
  
  if (uri.includes('/ipfs/')) {
    const parts = uri.split('/ipfs/');
    return `https://ipfs.io/ipfs/${parts[1]}`;
  }
  
  return uri;
};

// Fetch metadata from URI
async function fetchMetadata(uri: string): Promise<any> {
  try {
    const httpUri = convertIpfsUri(uri);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(httpUri, { 
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

      for (const asset of assets) {
        try {
          // Only process NFTs (decimals = 0, amount = 1)
          if (asset.token.amount !== BigInt(1) || asset.mint.decimals !== 0) {
            continue;
          }

          const metadata = asset.metadata;
          
          // Filter by collection if specified
          if (COLLECTION_ADDRESS) {
            if (!metadata.collection || metadata.collection.__option === 'None') {
              // NFT has no collection, skip it
              continue;
            }
            
            const collection = metadata.collection.value;
            const collectionAddress = collection.key.toString();
            
            // Only include if collection matches and is verified
            if (collectionAddress !== COLLECTION_ADDRESS || !collection.verified) {
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
                image = convertIpfsUri(offChainMetadata.image || '');
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
