/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface BrandLogoProps {
  /**
   * 'symbol': BD-D Orbit-Pulse Bowl mark (viewBox 0 0 256 256)
   * 'wordmark': vector wordmark "VLO" only (viewBox 255 72 308 112)
   * 'lockup': horizontal mark with vector wordmark (viewBox 0 0 584 256)
   */
  variant?: 'symbol' | 'wordmark' | 'lockup';
  /** Wraps symbol in Carbon/Paper app-icon tile */
  withTile?: boolean;
  className?: string;
  title?: string;
}

/**
 * VLO Official Brand Logo Component (BD-D — "Orbit-Pulse Bowl" · Carbon + Emerald)
 *
 * Geometry:
 * - Symbol: Vault body + Sapphire Flow Pulse arc + Emerald Core Focus dot
 * - Wordmark: Rounded-geometric "VLO"
 *
 * Theme color adaptation (DESIGN.md):
 * - Light surface: #151D2A Vault Ink + #1769E8 Flow Pulse + #059669 Core Focus Dot
 * - Dark surface:  #F2F5F9 Vault Ink + #1769E8 Flow Pulse + #10B981 Core Focus Dot
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'lockup',
  withTile = false,
  className = 'h-8 w-auto',
  title = 'VLO',
}) => {
  if (variant === 'symbol') {
    const svg = (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={withTile ? '14 14 228 228' : '0 0 256 256'}
        fill="none"
        aria-label={title}
        role="img"
        className={withTile ? 'h-full w-full block' : `shrink-0 ${className}`}
      >
        <title>{title}</title>
        <path
          className="fill-[#151D2A] dark:fill-[#F2F5F9] transition-colors duration-150"
          fillRule="evenodd"
          d="M 34.21 74.65 A 18.00 18.00 0 0 1 65.79 57.35 L 95.13 110.93 A 58.00 58.00 0 1 1 80.00 150.00 C 80.00 124.00, 54.00 106.00, 34.21 74.65 Z M 138.00 125.00 A 25.00 25.00 0 1 0 138.10 125.00 Z"
        />
        <path
          className="fill-[#1769E8] transition-colors duration-150"
          d="M 174.61 67.78 A 90.00 90.00 0 0 1 223.60 122.19 A 10.00 10.00 0 0 1 204.57 128.37 A 70.00 70.00 0 0 0 166.47 86.05 A 10.00 10.00 0 0 1 174.61 67.78 Z"
        />
        <path
          className="fill-[#059669] dark:fill-[#10B981] transition-colors duration-150"
          d="M 138.00 136.00 A 14.00 14.00 0 1 1 137.90 136.00 Z"
        />
      </svg>
    );

    if (withTile) {
      return (
        <span
          className={`inline-flex items-center justify-center shrink-0 overflow-hidden rounded-[22%] bg-white dark:bg-[#11151B] border border-[#DDE3EA] dark:border-[#252B34] ${className}`}
        >
          {svg}
        </span>
      );
    }

    return svg;
  }

  if (variant === 'wordmark') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="255 72 308 112"
        fill="none"
        aria-label={title}
        role="img"
        className={`shrink-0 ${className}`}
      >
        <title>{title}</title>
        <path
          className="fill-[#151D2A] dark:fill-[#F2F5F9] transition-colors duration-150"
          fillRule="evenodd"
          d="M 262 80 H 285 L 304 148 L 323 80 H 346 L 316.5 176 H 291.5 Z M 366 80 H 387 V 150 A 6 6 0 0 0 393 156 H 434 V 176 H 389 A 23 23 0 0 1 366 153 Z M 504 78 A 50 50 0 1 1 503.9 78 Z M 504 99 A 29 29 0 1 0 504.1 99 Z"
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 584 256"
      fill="none"
      aria-label={title}
      role="img"
      className={`shrink-0 ${className}`}
    >
      <title>{title}</title>
      <path
        className="fill-[#151D2A] dark:fill-[#F2F5F9] transition-colors duration-150"
        fillRule="evenodd"
        d="M 34.21 74.65 A 18.00 18.00 0 0 1 65.79 57.35 L 95.13 110.93 A 58.00 58.00 0 1 1 80.00 150.00 C 80.00 124.00, 54.00 106.00, 34.21 74.65 Z M 138.00 125.00 A 25.00 25.00 0 1 0 138.10 125.00 Z"
      />
      <path
        className="fill-[#1769E8] transition-colors duration-150"
        d="M 174.61 67.78 A 90.00 90.00 0 0 1 223.60 122.19 A 10.00 10.00 0 0 1 204.57 128.37 A 70.00 70.00 0 0 0 166.47 86.05 A 10.00 10.00 0 0 1 174.61 67.78 Z"
      />
      <path
        className="fill-[#059669] dark:fill-[#10B981] transition-colors duration-150"
        d="M 138.00 136.00 A 14.00 14.00 0 1 1 137.90 136.00 Z"
      />
      <path
        className="fill-[#151D2A] dark:fill-[#F2F5F9] transition-colors duration-150"
        fillRule="evenodd"
        d="M 262 80 H 285 L 304 148 L 323 80 H 346 L 316.5 176 H 291.5 Z M 366 80 H 387 V 150 A 6 6 0 0 0 393 156 H 434 V 176 H 389 A 23 23 0 0 1 366 153 Z M 504 78 A 50 50 0 1 1 503.9 78 Z M 504 99 A 29 29 0 1 0 504.1 99 Z"
      />
    </svg>
  );
};
