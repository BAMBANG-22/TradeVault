/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { VloDotRevealLogo } from './VloDotRevealLogo';
import { BrandLogo } from './BrandLogo';

interface SplashScreenProps {
  onComplete?: () => void;
}

/**
 * VLO Startup Splash Screen
 * Plays the Dot-to-Solid ("Kosong -> Titik Mikro -> Desain Tegas") reveal once on app mount,
 * then smoothly fades out into the live dashboard without blocking background hydration.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'active' | 'fading' | 'done'>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return 'done';
    }
    return 'active';
  });

  useEffect(() => {
    if (phase === 'done') {
      onComplete?.();
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      setPhase('fading');
    }, 1680);

    const doneTimer = window.setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, 1960);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [phase, onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      data-testid="vlo-splash-screen"
      onClick={() => {
        setPhase('fading');
        window.setTimeout(() => {
          setPhase('done');
          onComplete?.();
        }, 180);
      }}
      style={{ contain: 'strict', transform: 'translateZ(0)' }}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#EEF2F6] dark:bg-[#050607] transition-opacity duration-280 ease-out will-change-[opacity] select-none ${
        phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100 cursor-pointer'
      }`}
      aria-label="VLO"
    >
      <div className="flex flex-col items-center gap-6">
        <VloDotRevealLogo
          size={144}
          speed="normal"
          roundedClassName="rounded-[26%]"
          title="VLO"
        />
        <div className="vlo-splash-wordmark flex flex-col items-center gap-2">
          <BrandLogo variant="wordmark" className="h-10 sm:h-11 w-auto" title="VLO" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#697586] dark:text-[#929BA9]">
            Trading Journal
          </span>
        </div>
      </div>
    </div>
  );
};
