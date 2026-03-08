'use client';

import { useState } from 'react';
import { NFT } from '@/types';

interface MultiBurnResult {
  success: boolean;
  signatures: string[];
  burnedCount: number;
  error?: string;
}

export const useBurnNFT = () => {
  const [burning, setBurning] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [txSignatures, setTxSignatures] = useState<string[]>([]);

  // ❌ BURN FUNCTIONALITY DISABLED
  const burnMultipleNFTs = async (
    nftsToBurn: NFT[],
    upgradeTargets: NFT[],
  ): Promise<MultiBurnResult> => {
    return {
      success: false,
      signatures: [],
      burnedCount: 0,
      error: 'Burn functionality has been disabled.',
    };
  };

  return { burnMultipleNFTs, burning, status, error, progress, txSignatures };
};