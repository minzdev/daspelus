const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Icon({ children, className = 'h-5 w-5', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base} {...rest}>
      {children}
    </svg>
  )
}

export const IconDashboard = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
  </Icon>
)

export const IconBuilding = (p) => (
  <Icon {...p}>
    <path d="M3 21h18" />
    <path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16" />
    <path d="M15 9h3a2 2 0 012 2v10" />
    <path d="M8 7h2M8 11h2M8 15h2M18 13h.01M18 17h.01" />
  </Icon>
)

export const IconUsers = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M2.75 20c.5-3.2 3-5 6.25-5s5.75 1.8 6.25 5" />
    <path d="M16 5.4a3 3 0 010 5.7M18.5 15.3c1.6.8 2.6 2.2 2.9 4.2" />
  </Icon>
)

export const IconTarget = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.75" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconChart = (p) => (
  <Icon {...p}>
    <path d="M3 3v16a2 2 0 002 2h16" />
    <path d="M7 15v-4M11 15V7M15 15v-6M19 15V5" />
  </Icon>
)

export const IconInput = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M8 14h3M8 17h6" />
  </Icon>
)

export const IconHistory = (p) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 108.5-8.5c-3.6 0-6.7 2.2-7.9 5.4" />
    <path d="M3.5 4.5v4.4h4.4" />
    <path d="M12 8v4l2.8 1.7" />
  </Icon>
)

export const IconLogout = (p) => (
  <Icon {...p}>
    <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </Icon>
)

export const IconPlus = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconEdit = (p) => (
  <Icon {...p}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
)

export const IconTrash = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    <path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
)

export const IconCheck = (p) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5L20 6.5" />
  </Icon>
)

export const IconX = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const IconWarning = (p) => (
  <Icon {...p}>
    <path d="M12 3.5L22 20H2L12 3.5z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Icon>
)

export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20.5 20.5L16.7 16.7" />
  </Icon>
)

export const IconRefresh = (p) => (
  <Icon {...p}>
    <path d="M20.5 12a8.5 8.5 0 11-2.5-6" />
    <path d="M20.5 3.5v4.4h-4.4" />
  </Icon>
)

export const IconEye = (p) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const IconEyeOff = (p) => (
  <Icon {...p}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.9A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17.5 17.5 0 01-3.3 4M6.1 8A17 17 0 002.5 12s3.5 6.5 9.5 6.5a9.4 9.4 0 003.9-.8" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Icon>
)

export const IconMenu = (p) => (
  <Icon {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Icon>
)

export const IconCalendar = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Icon>
)

export const IconFlag = (p) => (
  <Icon {...p}>
    <path d="M5 21V4" />
    <path d="M5 4.5c4-2.4 6 2 10 .5V13c-4 1.5-6-2.9-10-.5" />
  </Icon>
)

export const IconGraduation = (p) => (
  <Icon {...p}>
    <path d="M2.5 9.5L12 4.5l9.5 5L12 14.5l-9.5-5z" />
    <path d="M6.5 11.8V16c1.5 1.6 9.5 1.6 11 0v-4.2" />
    <path d="M21.5 9.5v5" />
  </Icon>
)

export const IconPeople = (p) => (
  <Icon {...p}>
    <circle cx="8" cy="7.5" r="3" />
    <circle cx="16.5" cy="9" r="2.4" />
    <path d="M2.5 19.5c.4-3 2.5-4.8 5.5-4.8s5.1 1.8 5.5 4.8" />
    <path d="M15.5 19.5c.2-1.7 1-3 2.3-3.7a2.8 2.8 0 013.7 1c.5.8.7 1.7.7 2.7" />
  </Icon>
)

export const IconChevronDown = (p) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const IconKey = (p) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.2 11.8L20 3M16 7l3 3M13.5 9.5l2 2" />
  </Icon>
)

export const IconInfo = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8h.01" />
  </Icon>
)

export const IconArrowUp = (p) => (
  <Icon {...p}>
    <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
  </Icon>
)

export const IconLock = (p) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
    <path d="M12 14.5v2.5" />
  </Icon>
)

export const IconUnlock = (p) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 018 0" />
    <path d="M12 14.5v2.5" />
  </Icon>
)

/** Ikon lapisan/program bertingkat. */
export const IconLayers = (p) => (
  <Icon {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 12.5l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </Icon>
)

/** Ikon salin/tirukan (untuk salin target bulan). */
export const IconCopy = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </Icon>
)

/** Ikon WhatsApp (filled, mengikuti brand). */
export const IconWhatsApp = ({ className = 'h-5 w-5', ...rest }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" {...rest}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
)

/** Ikon unduh. */
export const IconDownload = (p) => (
  <Icon {...p}>
    <path d="M12 3v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </Icon>
)

/** Ikon dokumen/file teks. */
export const IconFileText = (p) => (
  <Icon {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Icon>
)

/** Ikon filter/pencarian. */
export const IconFilter = (p) => (
  <Icon {...p}>
    <path d="M4 21l3-9m0 0V5a2 2 0 012-2h8a2 2 0 012 2v7m-3 9l3 9M7 21h10" />
  </Icon>
)

/** Ikon Transportasi Darat. */
export const IconTruck = (p) => (
  <Icon {...p}>
    <path d="M1 3h15v13H1z" />
    <path d="M16 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </Icon>
)

/** Ikon Transportasi Laut. */
export const IconShip = (p) => (
  <Icon {...p}>
    <path d="M2 17l2 4h16l2-4H2z" />
    <path d="M6 17V9h12v8" />
    <path d="M12 4v5" />
    <path d="M9 6h6" />
  </Icon>
)

/** Ikon Transportasi Udara. */
export const IconPlane = (p) => (
  <Icon {...p}>
    <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20 2.5S16.5 3 15 4.5L11.5 8 3.3 6.2c-.6-.1-1.2.1-1.5.6l-.3.5c-.3.5-.2 1.2.3 1.6L8 14l-3 3-2.5-.5c-.4-.1-.8.1-1 .4l-.3.4c-.2.4-.1.8.2 1.1l3.2 2.7 2.7 3.2c.3.3.7.4 1.1.2l.4-.3c.3-.2.5-.6.4-1L9 20l3-3 5.1 6.2c.4.5 1.1.6 1.6.3l.5-.3c.5-.3.7-.9.6-1.5z" />
  </Icon>
)

/** Ikon Peringatan (Alert Triangle). */
export const IconAlertTriangle = (p) => (
  <Icon {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
)

/** Ikon Panah Kanan. */
export const IconArrowRight = (p) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
)

/** Ikon Lonceng Notifikasi. */
export const IconBell = (p) => (
  <Icon {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Icon>
)

/** Ikon Lonceng Notifikasi Berdering/Aktif. */
export const IconBellRing = (p) => (
  <Icon {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    <path d="M4 4a16 16 0 0 1 16 0" />
  </Icon>
)

/** Ikon Centang Berlingkar (Approved). */
export const IconCheckCircle = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
)

/** Ikon Silang Berlingkar (Rejected). */
export const IconXCircle = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </Icon>
)

/** Ikon Jam / Waktu. */
export const IconClock = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
)

/** Ikon Kotak Masuk (Inbox). */
export const IconInbox = (p) => (
  <Icon {...p}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
)

/** Ikon Kotak Centang Persetujuan (CheckSquare). */
export const IconCheckSquare = (p) => (
  <Icon {...p}>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Icon>
)




