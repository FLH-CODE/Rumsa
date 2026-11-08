import type { SVGProps } from 'react'

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function FullscreenEnterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  )
}

export function FullscreenExitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function DrawingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="3" width="13" height="16" rx="1.5" />
      <path d="M8 8h5M8 12h5M8 16h3" />
      <path d="M17 7l3 3v9a1.5 1.5 0 0 1-1.5 1.5H10" />
    </svg>
  )
}

/** Förenklad 2D-planritning – flera rum avdelade av väggar plus en dörrsvep, så den läses
 * entydigt som "en planritning" även i stort format på startskärmen. */
export function FloorPlanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 13h8M11 3v9M11 15v6M16 13v8" />
      <path d="M8 13a3 3 0 0 0 3-3" />
    </svg>
  )
}

export function OtherIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
    </svg>
  )
}

export function FurnitureIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 12V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V12" />
      <path d="M4.5 12h15a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
      <path d="M6 17v3M18 17v3" />
    </svg>
  )
}

export function PersonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  )
}

export function TagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 3H5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8l-9-9a2 2 0 0 0-1.4-.6Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  )
}

export function ExportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 18v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  )
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h16l-6 7.5V19l-4 2v-8.5Z" />
    </svg>
  )
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** Tre horisontella linjer – symbolen för att öppna/redigera en anteckning knuten till en
 * applicerad tagg (se MaterialEntry i InventoryWorkspace.tsx). */
export function NoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  )
}

export function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} stroke="none" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  )
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.24 1.23" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.24-1.23" />
    </svg>
  )
}

/** "Kopplingen bruten" – samma två bågar som LinkIcon, fast isärdragna (inte sammanlänkade) plus
 * ett snett streck tvärs över, så det tydligt läses som motsatsen till en aktiv koppling. */
export function LinkOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M10.5 15.5a4 4 0 0 1-5.4 0 3.8 3.8 0 0 1 0-5.4L7 8.2" />
      <path d="M13.5 8.5a4 4 0 0 1 5.4 0 3.8 3.8 0 0 1 0 5.4L17 15.8" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

/** Tydlig, tjock pil (inte webbläsarens tunna "←"-tecken) för "tillbaka"-knappar – samma
 * streckbredd/ändar som appens övriga ikoner, så den läses konsekvent och centrerar sig korrekt
 * i en rund tap-target istället för att sitta snett pga tecknets egna, ojämna marginaler. */
export function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  )
}

/** Suddgummi – symbolen för att rensa rummets egen ifyllda data (se RoomInventorySheet.tsx). */
export function EraserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M19 20H9L4.5 15.5a2 2 0 0 1 0-2.83l7-7a2 2 0 0 1 2.83 0l5 5a2 2 0 0 1 0 2.83L13.5 19" />
      <path d="M8 13l5.5 5.5" />
    </svg>
  )
}

/** Lista/dokument – symbolen för att visa en samlad sammanfattning av rummets data (se
 * InventoryWorkspace.tsx). */
export function SummaryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </svg>
  )
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

/** Två överlappande rektanglar – symbolen för att kopiera in ett typrums data EN gång utan att
 * koppla rummet till det (se "Använd en gång" i RoomInventorySheet.tsx), till skillnad från
 * LinkIcon som står för en stående koppling. */
export function CopyOnceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="8" width="12" height="12" rx="1.5" />
      <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H18a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H16" />
    </svg>
  )
}
