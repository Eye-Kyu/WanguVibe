// Single source of truth for admin panel navigation — shared by Sidebar.jsx
// and CommandPalette.jsx so the two never drift out of sync with each other.
import {
    IconHome, IconReceipt, IconHanger, IconUsers, IconBox,
    IconClipboard, IconClock, IconGift, IconRefresh, IconUser, IconTag,
    IconPhone, IconCart, IconTrendingUp, IconAlertTriangle, IconBarChart,
    IconWebhook, IconKey, IconCash,
} from '../components/icons';

export const ADMIN_NAV_ITEMS = [
    { to: '/admin', end: true, label: 'Dashboard', Icon: IconHome },
    { to: '/admin/sales', label: 'Sales', Icon: IconReceipt },
    { to: '/admin/styles', label: 'Styles', Icon: IconHanger },
    { to: '/admin/customers', label: 'Customers', Icon: IconUsers },
    { to: '/admin/inventory', label: 'Inventory', Icon: IconBox },
    { to: '/admin/suppliers', label: 'Suppliers', Icon: IconPhone },
    { to: '/admin/purchase-orders', label: 'Purchase Orders', Icon: IconCart },
    { to: '/admin/margins', label: 'Margin Report', Icon: IconTrendingUp },
    { to: '/admin/forecast', label: 'Reorder Forecast', Icon: IconAlertTriangle },
    { to: '/admin/analytics', label: 'Analytics', Icon: IconBarChart },
    { to: '/admin/exceptions', label: 'Exceptions', Icon: IconAlertTriangle },
    { to: '/admin/webhooks', label: 'Webhooks', Icon: IconWebhook },
    { to: '/admin/api-keys', label: 'API Keys', Icon: IconKey },
    { to: '/admin/audit', label: 'Audit Log', Icon: IconClipboard },
    { to: '/admin/shifts', label: 'Shifts', Icon: IconClock },
    { to: '/admin/giftcards', label: 'Gift Cards', Icon: IconGift },
    { to: '/admin/layaways', label: 'Layaways', Icon: IconTag },
    { to: '/admin/etims', label: 'eTIMS Retry', Icon: IconRefresh },
    { to: '/admin/refunds', label: 'M-Pesa Refunds', Icon: IconCash },
    { to: '/admin/users', label: 'Users', Icon: IconUser },
];
