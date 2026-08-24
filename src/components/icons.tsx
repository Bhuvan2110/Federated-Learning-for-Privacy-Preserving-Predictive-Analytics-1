/* FedShield — hand-drawn inline SVG icon set (stroke-based, 24px grid) */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function base(props: P) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    width: 18,
    height: 18,
    ...props,
  };
}

export const IconLogo = (props: P) => (
  <svg {...base(props)} strokeWidth={1.6}>
    <path d="M12 2.5 20 6v6.2c0 5-3.4 8.4-8 9.8-4.6-1.4-8-4.8-8-9.8V6z" />
    <circle cx="12" cy="9" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="8.2" cy="14.2" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15.8" cy="14.2" r="1.4" fill="currentColor" stroke="none" />
    <path d="M11 10.4l-2 2.7M13 10.4l2 2.7M9.6 14.2h4.8" />
  </svg>
);

export const IconGrid = (props: P) => (
  <svg {...base(props)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);

export const IconPlus = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconFlask = (props: P) => (
  <svg {...base(props)}>
    <path d="M9.5 3h5M10.5 3v5.2L5.6 17a2.4 2.4 0 0 0 2.1 3.5h8.6a2.4 2.4 0 0 0 2.1-3.5l-4.9-8.8V3" />
    <path d="M7.5 14h9" />
    <circle cx="11" cy="17" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14" cy="16.2" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconNodes = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="5" r="2.2" />
    <circle cx="5" cy="18" r="2.2" />
    <circle cx="19" cy="18" r="2.2" />
    <path d="M10.9 7 6 16M13.1 7 18 16M7.2 18h9.6" />
  </svg>
);

export const IconDatabase = (props: P) => (
  <svg {...base(props)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
    <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </svg>
);

export const IconShield = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 2.5 20 6v6.2c0 5-3.4 8.4-8 9.8-4.6-1.4-8-4.8-8-9.8V6z" />
    <path d="M8.8 12l2.2 2.2 4.2-4.4" />
  </svg>
);

export const IconChart = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 4v16h16" />
    <path d="M7.5 14.5 11 11l2.8 2.6L18.5 8" />
    <circle cx="18.5" cy="8" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconHistory = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 5v4h4" />
    <path d="M4.5 9A8 8 0 1 1 4 13" />
    <path d="M12 8v4.5l3 1.8" />
  </svg>
);

export const IconGoogle = (props: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} {...props}>
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
    <path fill="#34A853" d="M12 21.5c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4H3.2v2.6A9.9 9.9 0 0 0 12 21.5z" />
    <path fill="#FBBC05" d="M6.5 13.6a6 6 0 0 1 0-3.8V7.2H3.2a10 10 0 0 0 0 9z" />
    <path fill="#EA4335" d="M12 6.4c1.5 0 2.8.5 3.8 1.5L18.7 5A9.6 9.6 0 0 0 12 2.5 9.9 9.9 0 0 0 3.2 7.2l3.3 2.6A5.9 5.9 0 0 1 12 6.4z" />
  </svg>
);

export const IconEye = (props: P) => (
  <svg {...base(props)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconEyeOff = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-3.2 3.9M6 8.3A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.5-.7" />
    <path d="M9.5 9.8a2.8 2.8 0 0 0 3.9 3.9" />
  </svg>
);

export const IconMail = (props: P) => (
  <svg {...base(props)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const IconKey = (props: P) => (
  <svg {...base(props)}>
    <circle cx="8" cy="15" r="4.2" />
    <path d="m11.2 11.8 8-8M17 6l2.5 2.5M14 9l2 2" />
  </svg>
);

export const IconUser = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5" />
  </svg>
);

export const IconCheck = (props: P) => (
  <svg {...base(props)}>
    <path d="m4.5 12.5 5 5L19.5 7" />
  </svg>
);

export const IconX = (props: P) => (
  <svg {...base(props)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconAlert = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 3.5 22 20H2z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconDownload = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" />
    <path d="M4 16.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2.5" />
  </svg>
);

export const IconTrash = (props: P) => (
  <svg {...base(props)}>
    <path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6M6.5 6.5l.8 12A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9l.8-12.1" />
    <path d="M10 10.5v6M14 10.5v6" />
  </svg>
);

export const IconLock = (props: P) => (
  <svg {...base(props)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

export const IconArrowRight = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

export const IconLogout = (props: P) => (
  <svg {...base(props)}>
    <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
    <path d="M16 8l4 4-4 4M20 12H9.5" />
  </svg>
);

export const IconMenu = (props: P) => (
  <svg {...base(props)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconBolt = (props: P) => (
  <svg {...base(props)}>
    <path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12z" />
  </svg>
);

export const IconInfo = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconServer = (props: P) => (
  <svg {...base(props)}>
    <rect x="3.5" y="4" width="17" height="7" rx="1.6" />
    <rect x="3.5" y="13" width="17" height="7" rx="1.6" />
    <circle cx="7" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="7" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    <path d="M11 7.5h6M11 16.5h6" />
  </svg>
);

export const IconPlay = (props: P) => (
  <svg {...base(props)}>
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);

export const IconStop = (props: P) => (
  <svg {...base(props)}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

export const IconRefresh = (props: P) => (
  <svg {...base(props)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 3.5V8h-4.5" />
  </svg>
);

export const IconChevron = (props: P) => (
  <svg {...base(props)}>
    <path d="m8 10 4 4 4-4" />
  </svg>
);

export const IconSend = (props: P) => (
  <svg {...base(props)}>
    <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z" />
  </svg>
);

export const IconSparkle = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 4c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6z" />
    <path d="M19 15.5c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5z" />
  </svg>
);

export const IconUpload = (props: P) => (
  <svg {...base(props)}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
);

export const IconPulse = (props: P) => (
  <svg {...base(props)}>
    <path d="M3 12h4l2.2-5.5L13 17l2.4-5H21" />
  </svg>
);

export const IconCoins = (props: P) => (
  <svg {...base(props)}>
    <ellipse cx="9" cy="7.5" rx="6" ry="2.8" />
    <path d="M3 7.5v5c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-5" />
    <path d="M3 12.5v4c0 1.5 2.7 2.8 6 2.8 1.2 0 2.4-.2 3.3-.5" />
    <path d="M15 11.2c3 .2 6 1.4 6 2.9v4.4c0 1.4-2.5 2.5-5.5 2.7" />
  </svg>
);

export const IconSignal = (props: P) => (
  <svg {...base(props)}>
    <path d="M5 19.5v-4M9.5 19.5v-8M14 19.5V7.5M18.5 19.5v-15" />
  </svg>
);

export const IconTerminal = (props: P) => (
  <svg {...base(props)}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="m7 9.5 3 3-3 3M12.5 15.5H17" />
  </svg>
);

export const IconGear = (props: P) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
  </svg>
);

export const IconQrCode = (props: P) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
    <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
    <path d="M14 14h3v3h-3zM18 17h3v4h-4v-1M14 19v2M17 14v2" />
  </svg>
);

export const IconMic = (props: P) => (
  <svg {...base(props)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
  </svg>
);



