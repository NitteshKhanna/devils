'use client';

import { FC } from 'react';

interface BurnModalProps {
  isOpen: boolean;
  nftName: string;
  status: string;
  error: string | null;
  onClose: () => void;
}

export const BurnModal: FC<BurnModalProps> = ({ 
  isOpen, 
  nftName, 
  status, 
  error,
  onClose 
}) => {
  if (!isOpen) return null;

  const isComplete = status.includes('✅') || status.includes('successfully');
  const canClose = isComplete || error;

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="relative max-w-lg w-full">
        {/* Glow effect */}
        <div className={`absolute -inset-1 rounded-3xl blur-2xl opacity-50 ${
          isComplete ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-gradient-to-r from-red-600 to-orange-600'
        } animate-pulse`}></div>
        
        <div className="relative glass rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className={`absolute inset-0 rounded-2xl blur-lg opacity-50 ${
                isComplete ? 'bg-green-600' : error ? 'bg-red-600' : 'bg-orange-600'
              }`}></div>
              <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl ${
                isComplete ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 
                error ? 'bg-gradient-to-br from-red-500 to-rose-600' :
                'bg-gradient-to-br from-red-500 to-orange-600 animate-pulse-glow'
              }`}>
                {isComplete ? '✅' : error ? '⚠️' : '🔥'}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">
                {isComplete ? 'Burn Complete!' : error ? 'Burn Failed' : 'Burning NFT'}
              </h2>
              <p className="text-sm text-zinc-400">NFT Destruction</p>
            </div>
          </div>
          
          {/* NFT Name */}
          <div className="glass rounded-xl p-4 mb-6">
            <p className="text-zinc-400 text-xs mb-1 uppercase tracking-wider">NFT Name</p>
            <p className="text-white font-semibold truncate" title={nftName}>
              {nftName}
            </p>
          </div>

          {/* Status / Error */}
          {error ? (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-5 mb-6 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-red-300 font-semibold mb-1">Error Occurred</p>
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl p-5 mb-6 ${
              isComplete ? 'bg-green-900/30 border border-green-800' : 'glass'
            }`}>
              {!isComplete && (
                <div className="flex items-center gap-4">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-4 border-red-500/30"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent animate-spin"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{status}</p>
                    <p className="text-zinc-400 text-xs mt-1">Please confirm in your wallet</p>
                  </div>
                </div>
              )}
              {isComplete && (
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <p className="text-green-300 font-semibold mb-1">Success!</p>
                    <p className="text-green-400 text-sm">{status}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress indicator */}
          {!isComplete && !error && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
          )}

          {/* Close button */}
          {canClose && (
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-semibold py-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-red-500/50 hover:scale-[1.02] active:scale-95"
            >
              {isComplete ? '🎉 Awesome!' : '✕ Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
