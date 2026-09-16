// Minimal outline icon set (24x24, stroke = currentColor) shared across the
// POS screen and the admin sidebar. Replaces emoji usage app-wide with a
// consistent, theme-able icon system — size/color are controlled entirely
// via the className passed in (e.g. "w-5 h-5 text-gray-500").

const base = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
};

export const IconHome = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 11.5L12 4l8 7.5M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9" />
    </svg>
);

export const IconReceipt = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-2.5-1.5L13 21l-1-1.5-1 1.5-2.5-1.5L6 21V3z" />
        <path strokeLinecap="round" d="M9 8h6M9 12h6" />
    </svg>
);

export const IconHanger = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a1.5 1.5 0 111.5 1.5H12v1.7l7.5 5a1.6 1.6 0 01-.9 2.9H5.4a1.6 1.6 0 01-.9-2.9l7.5-5" />
        <path strokeLinecap="round" d="M4 19.5h16" />
    </svg>
);

export const IconUsers = ({ className }) => (
    <svg {...base} className={className}>
        <circle cx="9" cy="8" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 20c0-3 2.7-5 6-5s6 2 6 5M16 8.2a3 3 0 010 5.6M21 20c0-2.5-2-4.3-4.5-4.9" />
    </svg>
);

export const IconUser = ({ className }) => (
    <svg {...base} className={className}>
        <circle cx="12" cy="8" r="3.2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </svg>
);

export const IconBox = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8L12 4l8.5 4v8L12 20l-8.5-4V8z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8L12 12m0 0l8.5-4M12 12v8" />
    </svg>
);

export const IconClipboard = ({ className }) => (
    <svg {...base} className={className}>
        <rect x="5" y="4" width="14" height="17" rx="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
        <path strokeLinecap="round" d="M8 11h8M8 15h8" />
    </svg>
);

export const IconClock = ({ className }) => (
    <svg {...base} className={className}>
        <circle cx="12" cy="12" r="8.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </svg>
);

export const IconGift = ({ className }) => (
    <svg {...base} className={className}>
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <rect x="5" y="12" width="14" height="9" rx="1" />
        <path strokeLinecap="round" d="M12 8v13" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c0-2.2-1.8-4-4-4-1.1 0-2 .9-2 2 0 1.1.9 2 2 2h4zm0 0c0-2.2 1.8-4 4-4 1.1 0 2 .9 2 2 0 1.1-.9 2-2 2h-4z" />
    </svg>
);

export const IconRefresh = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

export const IconPhoto = ({ className }) => (
    <svg {...base} strokeWidth={1.5} className={className}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5.5-5.5a1.5 1.5 0 00-2.12 0L4 19" />
    </svg>
);

export const IconCash = ({ className }) => (
    <svg {...base} className={className}>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" d="M6 9v.01M18 15v.01" />
    </svg>
);

export const IconPhone = ({ className }) => (
    <svg {...base} className={className}>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path strokeLinecap="round" d="M11 18h2" />
    </svg>
);

export const IconCard = ({ className }) => (
    <svg {...base} className={className}>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path strokeLinecap="round" d="M2.5 10h19M6 15h4" />
    </svg>
);

export const IconTag = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.6 3H5a2 2 0 00-2 2v6.6c0 .5.2 1 .6 1.4l9 9a2 2 0 002.8 0l6.6-6.6a2 2 0 000-2.8l-9-9c-.4-.4-.9-.6-1.4-.6z" />
        <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
);

export const IconPrinter = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18h12v4H6v-4zM3 9h18v7a1 1 0 01-1 1h-2v-4H6v4H4a1 1 0 01-1-1V9z" />
    </svg>
);

export const IconCart = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.2 12.4a2 2 0 002 1.6h7.6a2 2 0 002-1.6L20 8H6.2" />
        <circle cx="9.5" cy="20" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none" />
    </svg>
);

export const IconCamera = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 012-2h1.2l1-1.6A1 1 0 019 4h6a1 1 0 01.86.4L17 6h1a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        <circle cx="12" cy="13" r="3.5" />
    </svg>
);

export const IconSearch = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

export const IconCheck = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

export const IconTrendingUp = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" />
    </svg>
);

export const IconChevronLeft = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
    </svg>
);

export const IconX = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const IconBarChart = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m6 10V4m6 16v-7" />
    </svg>
);

export const IconWebhook = ({ className }) => (
    <svg {...base} className={className}>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path strokeLinecap="round" d="M8.2 7.3L15.8 4.7M8.5 7.5L11 16M15.5 7.5L13 16" />
    </svg>
);

export const IconKey = ({ className }) => (
    <svg {...base} className={className}>
        <circle cx="7" cy="15" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12.5L19 3m0 0v4m0-4h-4" />
    </svg>
);

export const IconAlertTriangle = ({ className }) => (
    <svg {...base} className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l9 16H3l9-16z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v4" />
        <circle cx="12" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
);
