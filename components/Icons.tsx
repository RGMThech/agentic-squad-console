import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...p }: P, path: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {path}
    </svg>
  );
}

export const IconHome = (p: P) => base(p, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>);
export const IconPlus = (p: P) => base(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconPlay = (p: P) => base(p, <path d="M7 4v16l13-8z" />);
export const IconList = (p: P) => base(p, <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>);
export const IconSettings = (p: P) => base(p, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconCheck = (p: P) => base(p, <path d="M20 6 9 17l-5-5" />);
export const IconX = (p: P) => base(p, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const IconClock = (p: P) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconExternal = (p: P) => base(p, <><path d="M14 4h6v6" /><path d="M10 14 20 4" /><path d="M20 14v6H4V4h6" /></>);
export const IconUsers = (p: P) => base(p, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M21.5 20a6.5 6.5 0 0 0-4-6" /></>);
export const IconKey = (p: P) => base(p, <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3" /><path d="m16 7 3 3" /></>);
export const IconBot = (p: P) => base(p, <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="12" cy="3" r="1" /><path d="M9 14h.01M15 14h.01" /></>);
export const IconGate = (p: P) => base(p, <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>);
export const IconLogout = (p: P) => base(p, <><path d="M15 17l5-5-5-5" /><path d="M20 12H9" /><path d="M12 21H5V3h7" /></>);
export const IconFile = (p: P) => base(p, <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></>);
export const IconCoins = (p: P) => base(p, <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>);
export const IconLayers = (p: P) => base(p, <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const IconGithub = (p: P) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
  </svg>
);
