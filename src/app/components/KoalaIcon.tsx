import React from 'react';

export default function KoalaIcon({ className = "w-6 h-6", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className} {...props}>
      {/* Left Ear */}
      <circle cx="25" cy="35" r="20" fill="currentColor" />
      <circle cx="25" cy="35" r="10" fill="var(--background)" />
      {/* Right Ear */}
      <circle cx="75" cy="35" r="20" fill="currentColor" />
      <circle cx="75" cy="35" r="10" fill="var(--background)" />
      {/* Head */}
      <ellipse cx="50" cy="55" rx="40" ry="35" fill="currentColor" />
      {/* Eyes */}
      <circle cx="35" cy="48" r="4.5" fill="var(--background)" />
      <circle cx="65" cy="48" r="4.5" fill="var(--background)" />
      {/* Nose */}
      <rect x="42" y="55" width="16" height="22" rx="8" fill="var(--background)" />
    </svg>
  );
}
