'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as xlsx from 'xlsx';
import { printThermalLabel, printDeliveryChallan } from '@/lib/thermalLabel';
import { useWebSocket } from '@/app/hooks/useWebSocket';
import BarcodeScanner from '@/app/components/BarcodeScanner';

const STATUS_COLUMNS = [
  { key: 'RECEIVED', label: 'Received / Queued', color: '#5a5a5a' },
  { key: 'PICKING', label: 'In Picking', color: 'var(--accent-purple)' },
  { key: 'PACKING', label: 'In Packing', color: 'var(--accent-blue)' },
  { key: 'QUALITY_CHECK', label: 'QC Inspection', color: 'var(--accent-teal)' },
  { key: 'STAGED', label: 'Staged at Dock', color: 'var(--accent-amber)' },
  { key: 'DISPATCHED', label: 'Dispatched', color: 'var(--accent-green)' },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const router = useRouter();

  // Auth check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = localStorage.getItem('wms_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/auth', { headers });
        const data = await res.json();
        if (!data.user || data.user.role !== 'ADMIN') {
          router.push('/');
        } else {
          setCurrentUser(data.user);
        }
      } catch {
        router.push('/');
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('wms_auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/auth', { method: 'GET', headers });
      const data = await res.json();
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'logout', name: data.user?.name, role: data.user?.role })
      });
    } catch {}
    localStorage.removeItem('wms_auth_token');
    localStorage.removeItem('wms_user');
    router.push('/');
  };

  const handleExport = () => {
    const link = document.createElement('a');
    link.href = '/api/export';
    link.setAttribute('download', 'warehouse_orders_export.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="zoho-app-shell">
      {/* ── Left Dark Sidebar ────────────────────────────────────────── */}
      <aside className="zoho-sidebar" style={{ width: sidebarCollapsed ? '64px' : '220px', transition: 'width 0.2s ease' }}>
        <div className="zoho-sidebar-logo" style={{ justifyContent: sidebarCollapsed ? 'center' : 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.35rem' }}>📦</span>
            {!sidebarCollapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: '#ffffff', fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1.05rem' }}>LogiFlow</span>
                <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 800 }}>▼</span>
              </div>
            )}
          </div>
        </div>

        <nav className="zoho-sidebar-nav">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: '📊' },
            { key: 'orders', label: 'Orders & Operations', icon: '📦' },
            { key: 'zonemap', label: 'Warehouse Map', icon: '🗺️' },
            { key: 'workers', label: 'Workers', icon: '👥' },
            { key: 'upload', label: 'Import Excel', icon: '🔌' },
            { key: 'export', label: 'Export Data', icon: '📥' },
            { key: 'analytics', label: 'Analytics & KPIs', icon: '📈' },
            { key: 'logs', label: 'Audit Logs', icon: '📋' },
            { key: 'settings', label: 'Settings', icon: '⚙️' },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`zoho-nav-item ${tab === item.key ? 'active' : ''}`}
              title={item.label}
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Sidebar Collapse Toggle Button */}
        <div style={{ padding: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: sidebarCollapsed ? 'center' : 'left' }}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.3rem 0.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <span>{sidebarCollapsed ? '➔' : '◀'}</span>
            {!sidebarCollapsed && <span style={{ fontSize: '0.78rem' }}>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Container: Topbar + Canvas ──────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header className="zoho-topbar">
          {/* Left: Clean Breadcrumb Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>LogiFlow Admin</span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 700 }}>
              {tab === 'upload' ? 'Import Excel' :
               tab === 'workers' ? 'Workers & Clearances' :
               tab === 'orders' ? 'Orders & Operations' :
               tab === 'zonemap' ? 'Warehouse Zone Map' :
               tab === 'analytics' ? 'Analytics & KPIs' :
               tab === 'logs' ? 'Audit Logs' :
               tab === 'export' ? 'Export Center' :
               tab === 'settings' ? 'System Settings' : 'Warehouse Dashboard'}
            </span>
          </div>

          {/* Right Tools Cluster */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Live Radar Sync Pill */}
            <div className="live-pulse-badge">
              <span className="live-pulse-dot" />
              <span>Live Synced</span>
            </div>

            {/* Quick Export Shortcut */}
            <button
              type="button"
              className="secondary"
              onClick={() => setTab('export')}
              style={{ padding: '0.38rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              title="Open Export Center"
            >
              📥 Export Data
            </button>

            {/* User Profile Avatar with sign out */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', borderLeft: '1px solid #e2e8f0', paddingLeft: '1rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}>
                {currentUser?.name ? currentUser.name[0].toUpperCase() : 'A'}
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                {currentUser?.name || 'Admin'}
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleLogout}
                style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}
                title="Sign Out"
              >
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Main View - All Navigation Sections */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-canvas)' }}>
          {tab === 'dashboard' && <ZohoDashboardHome onNavigate={(t) => setTab(t)} />}
          {tab === 'orders' && <OperationsTab />}
          {tab === 'zonemap' && <ZoneMapTab />}
          {tab === 'workers' && <WorkersTab />}
          {tab === 'upload' && <UploadTab onViewOrders={() => setTab('orders')} />}
          {tab === 'export' && <ExportTab />}
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Zoho-Style Dashboard Overview (LogiFlow Brand)
// ─────────────────────────────────────────────────────────────
function ZohoDashboardHome({ onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeModalOrder, setActiveModalOrder] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const [resOrders, resAnalytics] = await Promise.all([
        fetch('/api/orders?limit=100', { headers }),
        fetch('/api/analytics', { headers })
      ]);
      const dataOrders = await resOrders.json();
      const dataAnalytics = await resAnalytics.json();
      if (Array.isArray(dataOrders.orders)) setOrders(dataOrders.orders);
      if (resAnalytics.ok) setStats(dataAnalytics);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleWs = useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);
  useWebSocket('main-warehouse', handleWs);

  // Helper to extract attributes from order extra JSON
  const getOrderExtra = (ord) => {
    if (!ord?.extra) return {};
    try {
      return typeof ord.extra === 'string' ? JSON.parse(ord.extra) : ord.extra;
    } catch {
      return {};
    }
  };

  // Toggle filter by clicking KPI card
  const toggleFilter = (targetStatus) => {
    setStatusFilter(prev => prev === targetStatus ? 'ALL' : targetStatus);
  };

  // Quick status update from modal
  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdatingStatus(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id: orderId, status: newStatus })
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        if (activeModalOrder && activeModalOrder.id === orderId) {
          setActiveModalOrder(prev => ({ ...prev, status: newStatus }));
        }
        fetchDashboardData();
      }
    } catch (e) {
      console.error('Status update failed:', e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Real KPI counts directly from database analytics & orders
  const totalOrdersCount = stats?.totalOrders ?? orders.length;
  const receivedCount = stats?.statusCounts?.RECEIVED ?? orders.filter(o => o.status === 'RECEIVED').length;
  const toPackCount = (stats?.statusCounts?.PICKING || 0) + (stats?.statusCounts?.PACKING || 0);
  const toShipCount = stats?.statusCounts?.STAGED ?? orders.filter(o => o.status === 'STAGED').length;
  const toDeliverCount = stats?.statusCounts?.DISPATCHED ?? orders.filter(o => o.status === 'DISPATCHED').length;
  const totalInHand = orders.reduce((acc, o) => acc + (o.boxCount || 1), 0);

  // Filter orders for the Recent Orders table
  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'PACKING') {
        if (o.status !== 'PICKING' && o.status !== 'PACKING') return false;
      } else if (o.status !== statusFilter) {
        return false;
      }
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const extra = getOrderExtra(o);
    const cust = String(extra.Customer || extra['Customer Name'] || extra['PARTY NAME'] || extra['Party Name'] || '').toLowerCase();
    const dest = String(extra.Destination || extra['Destination City'] || extra['City'] || o.zone || '').toLowerCase();
    const trans = String(o.transporter || extra['Transporter Name'] || '').toLowerCase();
    const orderNo = String(o.orderNo || '').toLowerCase();
    const inv = String(o.invoiceNo || extra['Invoice No.'] || '').toLowerCase();
    const lr = String(o.lrNo || extra['Lr Number'] || '').toLowerCase();
    return orderNo.includes(q) || cust.includes(q) || dest.includes(q) || trans.includes(q) || inv.includes(q) || lr.includes(q);
  });

  return (
    <div className="zoho-canvas">
      {/* ── Top Row: Warehouse Activity & Overview ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Warehouse Floor Activity */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <div className="zoho-section-title" style={{ margin: 0 }}>Warehouse Floor Activity</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Click any metric card below to immediately filter orders on this page</div>
            </div>
            {statusFilter !== 'ALL' && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setStatusFilter('ALL')}
                style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, padding: '0.2rem 0.6rem', border: '1px solid #fecaca', borderRadius: '6px', background: '#fef2f2' }}
              >
                ✕ Reset Filter ({statusFilter})
              </button>
            )}
          </div>
          <div className="zoho-sales-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {/* Card 1: Received / Queued */}
            <div
              className="zoho-activity-card"
              onClick={() => toggleFilter('RECEIVED')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                borderLeft: '4px solid #6366f1',
                background: statusFilter === 'RECEIVED' ? '#eff6ff' : '#ffffff',
                boxShadow: statusFilter === 'RECEIVED' ? '0 0 0 2px #6366f1, 0 4px 12px rgba(99, 102, 241, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                transform: statusFilter === 'RECEIVED' ? 'translateY(-2px)' : 'none'
              }}
              title="Click to filter orders by RECEIVED"
            >
              <div className="zoho-activity-num" style={{ color: '#4f46e5' }}>{receivedCount.toLocaleString()}</div>
              <div className="zoho-activity-sub">Orders</div>
              <div className="zoho-activity-tag">
                <span style={{ color: '#6366f1' }}>📥</span> RECEIVED {statusFilter === 'RECEIVED' && '✓'}
              </div>
            </div>

            {/* Card 2: To Be Packed */}
            <div
              className="zoho-activity-card"
              onClick={() => toggleFilter('PACKING')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                borderLeft: '4px solid #0284c7',
                background: statusFilter === 'PACKING' ? '#f0f9ff' : '#ffffff',
                boxShadow: statusFilter === 'PACKING' ? '0 0 0 2px #0284c7, 0 4px 12px rgba(2, 132, 199, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                transform: statusFilter === 'PACKING' ? 'translateY(-2px)' : 'none'
              }}
              title="Click to filter orders by PICKING & PACKING"
            >
              <div className="zoho-activity-num" style={{ color: '#0284c7' }}>{toPackCount.toLocaleString()}</div>
              <div className="zoho-activity-sub">Orders</div>
              <div className="zoho-activity-tag">
                <span style={{ color: '#0284c7' }}>📦</span> IN PICK / PACK {statusFilter === 'PACKING' && '✓'}
              </div>
            </div>

            {/* Card 3: To Be Shipped */}
            <div
              className="zoho-activity-card"
              onClick={() => toggleFilter('STAGED')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                borderLeft: '4px solid #d97706',
                background: statusFilter === 'STAGED' ? '#fffbeb' : '#ffffff',
                boxShadow: statusFilter === 'STAGED' ? '0 0 0 2px #d97706, 0 4px 12px rgba(217, 119, 6, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                transform: statusFilter === 'STAGED' ? 'translateY(-2px)' : 'none'
              }}
              title="Click to filter orders by READY TO SHIP (STAGED)"
            >
              <div className="zoho-activity-num" style={{ color: '#d97706' }}>{toShipCount.toLocaleString()}</div>
              <div className="zoho-activity-sub">At Docks</div>
              <div className="zoho-activity-tag">
                <span style={{ color: '#d97706' }}>⚓</span> READY TO SHIP {statusFilter === 'STAGED' && '✓'}
              </div>
            </div>

            {/* Card 4: Dispatched */}
            <div
              className="zoho-activity-card"
              onClick={() => toggleFilter('DISPATCHED')}
              style={{
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                borderLeft: '4px solid #10b981',
                background: statusFilter === 'DISPATCHED' ? '#ecfdf5' : '#ffffff',
                boxShadow: statusFilter === 'DISPATCHED' ? '0 0 0 2px #10b981, 0 4px 12px rgba(16, 185, 129, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
                transform: statusFilter === 'DISPATCHED' ? 'translateY(-2px)' : 'none'
              }}
              title="Click to filter orders by DISPATCHED"
            >
              <div className="zoho-activity-num" style={{ color: '#10b981' }}>{toDeliverCount.toLocaleString()}</div>
              <div className="zoho-activity-sub">Orders</div>
              <div className="zoho-activity-tag">
                <span style={{ color: '#10b981' }}>🚚</span> DISPATCHED {statusFilter === 'DISPATCHED' && '✓'}
              </div>
            </div>
          </div>
        </div>

        {/* Warehouse Inventory Summary */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="zoho-section-title">System Inventory</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.65rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Total Orders</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{totalOrdersCount.toLocaleString()}</span>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.65rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Active Packages</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{totalInHand.toLocaleString()} Pkgs</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn-accent"
              onClick={() => onNavigate('upload')}
              style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.78rem', justifyContent: 'center' }}
            >
              ➕ Import Excel
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onNavigate('orders')}
              style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.78rem', justifyContent: 'center' }}
            >
              📦 View Orders
            </button>
          </div>
        </div>
      </div>

      {/* ── Middle Row: Carrier Telemetry & Priority Breakdown ───────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Logistics Partners / Transporters */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="zoho-section-title" style={{ margin: 0 }}>TOP LOGISTICS &amp; TRANSPORTERS</div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Active Carriers</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(stats?.topTransporters || []).slice(0, 4).map((t, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem' }}>🚛</span>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1e293b' }}>{t.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: 800, color: '#2563eb' }}>{t.count.toLocaleString()}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>orders</span>
                </div>
              </div>
            ))}
            {(!stats?.topTransporters || stats.topTransporters.length === 0) && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Carriers will appear here automatically when orders are imported.
              </div>
            )}
          </div>
        </div>

        {/* Priority & Fulfillment Telemetry */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div className="zoho-section-title">ORDER PRIORITY &amp; HEALTH</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                🚨 Urgent SLA Orders
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#dc2626' }}>{stats?.priorityCounts?.URGENT || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                ⚡ Express Priority Orders
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>{stats?.priorityCounts?.EXPRESS || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                📦 Standard Priority Orders
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{stats?.priorityCounts?.STANDARD || totalOrdersCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                ✅ Dispatched Today
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#059669' }}>{stats?.dispatchedToday || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Section: LIVE RECENT & IMPORTED ORDERS TABLE ────── */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        {/* Table Top Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>📦 Recent &amp; Imported Orders</h3>
              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700 }}>
                {filteredOrders.length} showing
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
              Real-time stream of warehouse orders imported from Excel manifests.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Quick Search with Clear Button */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 Search Order #, Customer, Transporter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '0.42rem 1.85rem 0.42rem 0.75rem', fontSize: '0.82rem', width: '280px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    boxShadow: 'none',
                    borderRadius: '50%'
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Status Filter Tabs */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.2rem', borderRadius: '6px', gap: '0.2rem' }}>
              {['ALL', 'RECEIVED', 'PACKING', 'STAGED', 'DISPATCHED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: statusFilter === st ? '#ffffff' : 'transparent',
                    color: statusFilter === st ? '#0f172a' : '#64748b',
                    boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Go to Operations View */}
            <button
              type="button"
              className="btn-accent"
              onClick={() => onNavigate('orders')}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              🚀 Open Operations Table →
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', margin: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase', width: '40px' }}>#</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Order ID / No</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Customer / Party</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Destination</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Transporter &amp; Vehicle</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Packages</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase' }}>Imported / Updated</th>
                <th style={{ padding: '0.65rem 0.8rem', color: '#64748b', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <div style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</div> Loading orders from database...
                  </td>
                </tr>
              )}
              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                      {search || statusFilter !== 'ALL' ? 'No orders match your filter criteria' : 'No orders found'}
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0.35rem auto 1rem', maxWidth: '400px' }}>
                      {search || statusFilter !== 'ALL'
                        ? 'Try clearing your search query or selecting a different status filter.'
                        : 'Upload an Excel spreadsheet (.xlsx/.xls) in the Import Excel section to register warehouse shipments.'}
                    </p>
                    {(!search && statusFilter === 'ALL') ? (
                      <button
                        type="button"
                        className="btn-accent"
                        onClick={() => onNavigate('upload')}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        ➕ Import Excel Spreadsheet Now
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {filteredOrders.slice(0, 35).map((o, idx) => {
                const extra = getOrderExtra(o);
                const cust = extra.Customer || extra['Customer Name'] || extra['PARTY NAME'] || extra['Party Name'] || extra['Party'] || extra['Consignee'] || extra['Buyer'] || '—';
                const dest = extra.Destination || extra['Destination City'] || extra['City'] || extra['Delivery City'] || o.zone || '—';
                const trans = o.transporter || extra['Transporter Name'] || extra['Transporter'] || '—';
                const vehicle = o.vehicleNo || extra['VECHILE Number'] || extra['Vehicle No'] || '';
                const timeStr = o.updatedAt ? new Date(o.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                const dateStr = o.updatedAt ? new Date(o.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                return (
                  <tr
                    key={o.id}
                    onClick={() => setActiveModalOrder(o)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.12s' }}
                    className="hover-row"
                  >
                    <td style={{ padding: '0.7rem 0.8rem', color: '#94a3b8', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem' }}>
                      <span className="mono" style={{ color: '#2563eb', fontWeight: 700, fontSize: '0.88rem' }}>
                        {o.orderNo}
                      </span>
                      {o.invoiceNo && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Inv: <span className="mono">{o.invoiceNo}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem', fontWeight: 600, color: '#1e293b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cust}>
                      {cust}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem', color: '#475569', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={dest}>
                      {dest}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem' }}>
                      <div style={{ color: '#334155', fontWeight: 500 }}>{trans}</div>
                      {vehicle && <span className="mono" style={{ fontSize: '0.72rem', color: '#64748b' }}>{vehicle}</span>}
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem', color: '#334155', fontWeight: 700 }}>
                      {o.boxCount || 1} <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 500 }}>pkg</span>
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem' }}>
                      <span className={`status-badge status-${o.status}`} style={{ fontSize: '0.74rem', padding: '0.2rem 0.55rem' }}>
                        <span className="dot" />
                        {o.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem', color: '#64748b', fontSize: '0.78rem' }}>
                      <div>{dateStr}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{timeStr}</div>
                    </td>
                    <td style={{ padding: '0.7rem 0.8rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={(e) => { e.stopPropagation(); setActiveModalOrder(o); }}
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}
                      >
                        Inspect ➔
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Showing <strong>{Math.min(filteredOrders.length, 35)}</strong> of <strong>{totalOrdersCount.toLocaleString()}</strong> registered orders.
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => onNavigate('orders')}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', fontWeight: 600 }}
          >
            Open Complete Operations Table ({totalOrdersCount.toLocaleString()} orders) ➔
          </button>
        </div>
      </div>

      {/* ── Sleek Order Quick-Inspect Modal ───────────────────────── */}
      {activeModalOrder && (
        <div className="modal-overlay" onClick={() => setActiveModalOrder(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', padding: '1.75rem' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                    {activeModalOrder.orderNo}
                  </span>
                  <span className={`status-badge status-${activeModalOrder.status}`}>
                    <span className="dot" />
                    {activeModalOrder.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Quick Order Inspector &bull; {activeModalOrder.boxCount || 1} package(s)
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setActiveModalOrder(null)}
                style={{ fontSize: '1.25rem', padding: '0.2rem 0.5rem', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Quick Status Advance Control */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
                  Update Order Stage:
                </span>
                <select
                  value={activeModalOrder.status}
                  disabled={updatingStatus}
                  onChange={(e) => handleUpdateStatus(activeModalOrder.id, e.target.value)}
                  style={{ width: 'auto', fontSize: '0.85rem', padding: '0.35rem 0.75rem', borderRadius: '6px', fontWeight: 600 }}
                >
                  <option value="RECEIVED">RECEIVED (Queued)</option>
                  <option value="PICKING">PICKING</option>
                  <option value="PACKING">PACKING</option>
                  <option value="QUALITY_CHECK">QUALITY CHECK</option>
                  <option value="STAGED">STAGED (Ready to Ship)</option>
                  <option value="DISPATCHED">DISPATCHED</option>
                  <option value="ON_HOLD">ON HOLD</option>
                </select>
              </div>
            </div>

            {/* Details Key/Value Grid */}
            {(() => {
              const extra = getOrderExtra(activeModalOrder);
              const cust = extra.Customer || extra['Customer Name'] || extra['PARTY NAME'] || extra['Party Name'] || extra['Party'] || '—';
              const dest = extra.Destination || extra['Destination City'] || extra['City'] || activeModalOrder.zone || '—';
              const trans = activeModalOrder.transporter || extra['Transporter Name'] || '—';
              const vehicle = activeModalOrder.vehicleNo || extra['VECHILE Number'] || '—';

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Customer / Party</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', marginTop: '0.15rem' }}>{cust}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Destination</div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem', marginTop: '0.15rem' }}>{dest}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Transporter / Carrier</div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginTop: '0.15rem' }}>{trans}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Vehicle Plate</div>
                    <div className="mono" style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginTop: '0.15rem' }}>{vehicle}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Invoice No</div>
                    <div className="mono" style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginTop: '0.15rem' }}>{activeModalOrder.invoiceNo || '—'}</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>LR / Tracking No</div>
                    <div className="mono" style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginTop: '0.15rem' }}>{activeModalOrder.lrNo || '—'}</div>
                  </div>
                </div>
              );
            })()}

            {/* Custom Excel Attributes Section */}
            {(() => {
              const extra = getOrderExtra(activeModalOrder);
              const keys = Object.keys(extra);
              if (keys.length === 0) return null;

              return (
                <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.03em' }}>
                    Excel Manifest Attributes ({keys.length}):
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '0.5rem' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        {keys.map((k) => (
                          <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.35rem 0.5rem', color: '#64748b', fontWeight: 600, width: '40%' }}>{k}</td>
                            <td style={{ padding: '0.35rem 0.5rem', color: '#0f172a', fontFamily: 'var(--font-mono)' }}>{String(extra[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setActiveModalOrder(null)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.84rem' }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-accent"
                onClick={() => { setActiveModalOrder(null); onNavigate('orders'); }}
                style={{ padding: '0.5rem 1.1rem', fontSize: '0.84rem' }}
              >
                Open Full Operations View →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Operations Tab (Metrics + Kanban + Table)
// ─────────────────────────────────────────
function OperationsTab() {
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban' | 'sheet'
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [availableExcelCols, setAvailableExcelCols] = useState([]);
  const [visibleCols, setVisibleCols] = useState([
    'orderNo', 'status', 'priority', 'customer', 'destination', 'transporter', 'boxCount', 'invoiceNo', 'lrNo'
  ]);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [extraColFilter, setExtraColFilter] = useState('');  // Excel column key to filter by
  const [extraColVal, setExtraColVal] = useState('');        // Value to match
  const [scannerOpen, setScannerOpen] = useState(false);

  // Real-time WebSocket connection
  const handleWsMessage = useCallback((event) => {
    if (event.type === 'STATUS_CHANGE') {
      setOrders(prev => prev.map(o => o.orderNo === event.orderNo ? { ...o, status: event.newStatus, updatedAt: new Date().toISOString() } : o));
    } else if (event.type === 'ORDER_UPDATE' || event.type === 'EXCEL_IMPORTED' || event.type === 'ORDER_DELETED' || event.type === 'BULK_UPLOAD' || event.type === 'ORDER_CREATED') {
      fetchOrders();
    }
  }, []);
  const { connectionStatus } = useWebSocket('main-warehouse', handleWsMessage);

  // Selected for Bulk Action
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('excel'); // 'excel' | 'edit' | 'timeline'
  const [attrSearch, setAttrSearch] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const [gatePassOpen, setGatePassOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState('DISPATCHED');
  const [bulkTransporter, setBulkTransporter] = useState('');
  const [bulkVehicle, setBulkVehicle] = useState('');
  const [bulkDock, setBulkDock] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState({});

  // Helper: parse order extra JSON safely
  const getOrderExtra = useCallback((ord) => {
    if (!ord?.extra) return {};
    try {
      return typeof ord.extra === 'string' ? JSON.parse(ord.extra) : ord.extra;
    } catch {
      return {};
    }
  }, []);

  // Standard column catalog
  const STANDARD_COLUMNS = [
    { id: 'orderNo', label: 'Order ID / No', isDefault: true },
    { id: 'status', label: 'Status', isDefault: true },
    { id: 'priority', label: 'Priority', isDefault: true },
    { id: 'customer', label: 'Customer / Party', isDefault: true },
    { id: 'destination', label: 'Destination / City', isDefault: true },
    { id: 'skuList', label: 'Items / SKU / Description', isDefault: false },
    { id: 'transporter', label: 'Transporter / Courier', isDefault: true },
    { id: 'vehicleNo', label: 'Vehicle Plate', isDefault: false },
    { id: 'boxCount', label: 'Packages / Qty', isDefault: true },
    { id: 'weightKg', label: 'Weight (kg)', isDefault: false },
    { id: 'zone', label: 'Storage Zone', isDefault: false },
    { id: 'dockBay', label: 'Dock / Bay Door', isDefault: false },
    { id: 'invoiceNo', label: 'Invoice No', isDefault: true },
    { id: 'lrNo', label: 'LR / Tracking No', isDefault: true },
  ];

  // Dynamic discovery of all unique Excel keys
  const allDiscoveredExcelCols = Array.from(
    new Set([
      ...availableExcelCols,
      ...orders.flatMap(o => Object.keys(getOrderExtra(o)))
    ])
  ).filter(k => !['orderNo', 'status', 'priority', 'id', 'Customer', 'Destination'].includes(k));

  // Load saved column preferences
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wms_visible_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleCols(parsed);
        }
      }
    } catch {}
  }, []);

  const toggleColumn = (colId) => {
    setVisibleCols(prev => {
      let next;
      if (prev.includes(colId)) {
        if (prev.length <= 1) return prev; // Keep at least one column
        next = prev.filter(c => c !== colId);
      } else {
        next = [...prev, colId];
      }
      try { localStorage.setItem('wms_visible_columns', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetToDefaultCols = () => {
    const def = STANDARD_COLUMNS.filter(c => c.isDefault).map(c => c.id);
    setVisibleCols(def);
    try { localStorage.setItem('wms_visible_columns', JSON.stringify(def)); } catch {}
  };

  const selectAllCols = () => {
    const all = [...STANDARD_COLUMNS.map(c => c.id), ...allDiscoveredExcelCols];
    setVisibleCols(all);
    try { localStorage.setItem('wms_visible_columns', JSON.stringify(all)); } catch {}
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (search.trim()) params.set('search', search.trim());
      if (extraColFilter && extraColVal.trim()) {
        params.set('extraKey', extraColFilter);
        params.set('extraVal', extraColVal.trim());
      }
      params.set('limit', '300');

      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const [resOrders, resAnalytics] = await Promise.all([
        fetch(`/api/orders?${params.toString()}`, { headers }),
        fetch('/api/analytics', { headers })
      ]);

      const dataOrders = await resOrders.json();
      const dataAnalytics = await resAnalytics.json();

      if (resOrders.ok) {
        setOrders(dataOrders.orders || []);
        if (dataOrders.availableExcelColumns && Array.isArray(dataOrders.availableExcelColumns)) {
          setAvailableExcelCols(dataOrders.availableExcelColumns);
        }
      }
      if (resAnalytics.ok) setStats(dataAnalytics);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
        if (search.trim()) params.set('search', search.trim());
        if (extraColFilter && extraColVal.trim()) {
          params.set('extraKey', extraColFilter);
          params.set('extraVal', extraColVal.trim());
        }
        params.set('limit', '300');

        const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const [resOrders, resAnalytics] = await Promise.all([
          fetch(`/api/orders?${params.toString()}`, { headers }),
          fetch('/api/analytics', { headers })
        ]);

        const dataOrders = await resOrders.json();
        const dataAnalytics = await resAnalytics.json();

        if (!ignore) {
          if (resOrders.ok) {
            setOrders(dataOrders.orders || []);
            if (dataOrders.availableExcelColumns && Array.isArray(dataOrders.availableExcelColumns)) {
              setAvailableExcelCols(dataOrders.availableExcelColumns);
            }
          }
          if (resAnalytics.ok) setStats(dataAnalytics);
        }
      } catch {
        if (!ignore) setOrders([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadData();
    return () => { ignore = true; };
  }, [statusFilter, priorityFilter, search, extraColFilter, extraColVal]);

  const handleOpenDetails = (order) => {
    setSelectedOrder(order);
    setModalTab('excel');
    setAttrSearch('');
    setCopySuccess(false);
    setEditForm({
      status: order.status,
      priority: order.priority,
      zone: order.zone || '',
      dockBay: order.dockBay || '',
      transporter: order.transporter || '',
      vehicleNo: order.vehicleNo || '',
      boxCount: String(order.boxCount || '1'),
      weightKg: order.weightKg ? String(order.weightKg) : '',
      invoiceNo: order.invoiceNo || '',
      lrNo: order.lrNo || '',
      notes: order.notes || '',
    });
    setEditModalOpen(true);
  };

  const handleOpenEdit = (order) => {
    setSelectedOrder(order);
    setModalTab('edit');
    setAttrSearch('');
    setCopySuccess(false);
    setEditForm({
      status: order.status,
      priority: order.priority,
      zone: order.zone || '',
      dockBay: order.dockBay || '',
      transporter: order.transporter || '',
      vehicleNo: order.vehicleNo || '',
      boxCount: String(order.boxCount || '1'),
      weightKg: order.weightKg ? String(order.weightKg) : '',
      invoiceNo: order.invoiceNo || '',
      lrNo: order.lrNo || '',
      notes: order.notes || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedOrder.id,
          ...editForm
        })
      });
      if (res.ok) {
        setEditModalOpen(false);
        fetchOrders();
      }
    } catch {}
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    try {
      const payload = {
        ids: selectedIds,
        status: bulkActionType,
        transporter: bulkTransporter || undefined,
        vehicleNo: bulkVehicle || undefined,
        dockBay: bulkDock || undefined,
        note: `Bulk changed to ${bulkActionType} via Admin Operations`
      };

      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setBulkModalOpen(false);
        setSelectedIds([]);
        fetchOrders();
      }
    } catch {}
  };

  const toggleSelectOrder = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(orders.map(o => o.id));
    }
  };

  const copyExcelAttributesToClipboard = () => {
    if (!selectedOrder) return;
    const extra = getOrderExtra(selectedOrder);
    const data = {
      orderNo: selectedOrder.orderNo,
      status: selectedOrder.status,
      priority: selectedOrder.priority,
      ...extra
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // Render Cell content by column key
  const renderCell = (ord, colId) => {
    const extra = getOrderExtra(ord);

    if (colId === 'orderNo') {
      return (
        <span
          className="mono"
          onClick={(e) => { e.stopPropagation(); handleOpenDetails(ord); }}
          style={{ fontWeight: 700, cursor: 'pointer', color: 'var(--accent-blue)', textDecoration: 'underline' }}
          title="Click to view all Excel data"
        >
          {ord.orderNo}
        </span>
      );
    }
    if (colId === 'status') {
      return (
        <span className={`status-badge status-${ord.status}`}>
          <span className="dot"></span>
          {ord.status.replace(/_/g, ' ')}
        </span>
      );
    }
    if (colId === 'priority') {
      return (
        <span className={`priority-tag ${ord.priority}`}>
          {ord.priority === 'URGENT' && '🚨 '}
          {ord.priority === 'EXPRESS' && '⚡ '}
          {ord.priority}
        </span>
      );
    }
    if (colId === 'customer') {
      const cust = extra.Customer || extra['Customer Name'] || extra['Party Name'] || extra['Party'] || extra['Consignee'] || extra['Buyer'] || extra['CustomerName'];
      return cust ? <strong style={{ color: 'var(--text-main)' }}>{cust}</strong> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }
    if (colId === 'destination') {
      const dest = extra.Destination || extra['Destination City'] || extra['City'] || extra['Delivery City'] || ord.zone;
      return dest ? <span>{dest}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }
    if (colId === 'skuList') {
      const sku = extra['Item Description'] || extra['Product'] || extra['Item'] || extra['SKU'] || ord.skuList;
      return sku ? <span style={{ maxWidth: '200px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sku}>{sku}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }
    if (colId === 'zone') return ord.zone || <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'dockBay') return ord.dockBay || <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'transporter') return ord.transporter || <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'vehicleNo') return ord.vehicleNo ? <span className="mono">{ord.vehicleNo}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'boxCount') return <span>{ord.boxCount}</span>;
    if (colId === 'weightKg') return ord.weightKg ? <span>{ord.weightKg} kg</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'invoiceNo') return ord.invoiceNo ? <span className="mono">{ord.invoiceNo}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (colId === 'lrNo') return ord.lrNo ? <span className="mono">{ord.lrNo}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>;

    // Custom Excel Column
    const val = extra[colId];
    if (val !== undefined && val !== null && val !== '') {
      return (
        <span style={{ maxWidth: '240px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(val)}>
          {String(val)}
        </span>
      );
    }
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  };

  const getColLabel = (colId) => {
    const std = STANDARD_COLUMNS.find(c => c.id === colId);
    if (std) return std.label;
    return colId;
  };

  return (
    <div>
      {/* Top Live Warehouse KPI Stat Cards */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card-pro">
            <div className="stat-header">
              <span className="stat-label">Total Volume</span>
              <span className="stat-icon">📦</span>
            </div>
            <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-footer">
              <span>All active &amp; completed orders</span>
            </div>
          </div>

          <div className="stat-card-pro process">
            <div className="stat-header">
              <span className="stat-label">In Picking / Packing</span>
              <span className="stat-icon" style={{ background: '#f5f3ff', color: 'var(--accent-purple)' }}>⚡</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
              {(stats.statusCounts?.PICKING || 0) + (stats.statusCounts?.PACKING || 0)}
            </div>
            <div className="stat-footer">
              <span>Active floor fulfillment</span>
            </div>
          </div>

          <div className="stat-card-pro urgent">
            <div className="stat-header">
              <span className="stat-label">Staged at Dock</span>
              <span className="stat-icon" style={{ background: '#fffbeb', color: 'var(--accent-amber)' }}>⚓</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
              {stats.statusCounts?.STAGED || 0}
            </div>
            <div className="stat-footer">
              <span>Awaiting transporter pickup</span>
            </div>
          </div>

          <div className="stat-card-pro success">
            <div className="stat-header">
              <span className="stat-label">Dispatched Today</span>
              <span className="stat-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>🚚</span>
            </div>
            <div className="stat-value" style={{ color: '#10b981' }}>
              {stats.dispatchedToday || 0}
            </div>
            <div className="stat-footer">
              <span>Vehicles departed dock</span>
            </div>
          </div>
        </div>
      )}

      {/* Operational Command & Filter Bar */}
      <div className="card-pro" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-lg)'
      }}>
        {/* Universal Search & Stage Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flex: 1, maxWidth: '460px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search Order No, Customer, City, Product, Invoice, Truck..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '2.4rem', paddingRight: '2rem', fontSize: '0.88rem', borderRadius: 'var(--radius-md)' }}
              />
              <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                🔍
              </span>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    boxShadow: 'none'
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => setScannerOpen(true)}
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap', borderRadius: 'var(--radius-md)' }}
              title="Open camera to scan barcode or QR code"
            >
              📸 Scan
            </button>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '160px', borderRadius: 'var(--radius-md)' }}
          >
            <option value="ALL">All Stages ({orders.length})</option>
            <option value="RECEIVED">Received / Queued</option>
            <option value="PICKING">Picking</option>
            <option value="PACKING">Packing</option>
            <option value="QUALITY_CHECK">QC Inspection</option>
            <option value="STAGED">Staged at Dock</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="ON_HOLD">On Hold</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '135px', borderRadius: 'var(--radius-md)' }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent Priority</option>
            <option value="EXPRESS">Express Priority</option>
            <option value="STANDARD">Standard Priority</option>
          </select>

          {(search || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || extraColFilter) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setSearch(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); setExtraColFilter(''); setExtraColVal(''); }}
              style={{ fontSize: '0.82rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', whiteSpace: 'nowrap' }}
              title="Reset all active search and filters"
            >
              ✕ Reset Filters
            </button>
          )}
        </div>

        {/* Dynamic Excel Column Filter */}
        {allDiscoveredExcelCols.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.75rem', background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Excel:</span>
            <select
              value={extraColFilter}
              onChange={(e) => { setExtraColFilter(e.target.value); setExtraColVal(''); }}
              style={{ width: 'auto', minWidth: '140px', fontSize: '0.82rem', padding: '0.3rem 0.6rem', borderRadius: '6px' }}
            >
              <option value="">— Choose Column —</option>
              {allDiscoveredExcelCols.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            {extraColFilter && (
              <input
                type="text"
                placeholder={`Filter ${extraColFilter}…`}
                value={extraColVal}
                onChange={(e) => setExtraColVal(e.target.value)}
                style={{ fontSize: '0.82rem', padding: '0.3rem 0.6rem', minWidth: '160px', maxWidth: '220px', borderRadius: '6px' }}
              />
            )}
            {(extraColFilter || extraColVal) && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setExtraColFilter(''); setExtraColVal(''); }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* View Switcher Capsule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div className="capsule-tabs" style={{ background: '#f1f5f9' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`capsule-tab-item ${viewMode === 'table' ? 'active' : ''}`}
            >
              📋 Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`capsule-tab-item ${viewMode === 'kanban' ? 'active' : ''}`}
            >
              📊 Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('sheet')}
              className={`capsule-tab-item ${viewMode === 'sheet' ? 'active' : ''}`}
            >
              📑 Sheet
            </button>
          </div>

          {/* Column Picker Trigger Button */}
          {viewMode === 'table' && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setColPickerOpen(!colPickerOpen)}
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem' }}
                title="Choose which columns from your Excel file to display in the table"
              >
                ⚙️ Columns ({visibleCols.length})
              </button>

              {/* Column Picker Dropdown Menu */}
              {colPickerOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.4rem',
                  width: '320px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  background: 'var(--bg-paper-lighter)',
                  border: '1px solid var(--border-dark)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 99,
                  padding: '0.85rem',
                  borderRadius: '3px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>Visible Table Columns</strong>
                    <button
                      type="button"
                      onClick={() => setColPickerOpen(false)}
                      style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', background: 'transparent', color: 'var(--text-muted)' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={resetToDefaultCols}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', flex: 1 }}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={selectAllCols}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', flex: 1 }}
                    >
                      Select All
                    </button>
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Standard Fields
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
                    {STANDARD_COLUMNS.map(col => (
                      <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(col.id)}
                          onChange={() => toggleColumn(col.id)}
                          style={{ width: 'auto' }}
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>

                  {allDiscoveredExcelCols.length > 0 && (
                    <>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '0.4rem', textTransform: 'uppercase', borderTop: '1px dotted var(--border-color)', paddingTop: '0.5rem' }}>
                        Uploaded Excel Custom Fields
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {allDiscoveredExcelCols.map(key => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={visibleCols.includes(key)}
                              onChange={() => toggleColumn(key)}
                              style={{ width: 'auto' }}
                            />
                            <span className="mono" style={{ fontSize: '0.78rem' }}>{key}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedIds.length > 0 && (
            <button
              type="button"
              className="btn-accent"
              onClick={() => setBulkModalOpen(true)}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
            >
              ⚡ Batch ({selectedIds.length})
            </button>
          )}

          <button
            type="button"
            className="secondary"
            onClick={() => setGatePassOpen(true)}
            style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
          >
            🖨️ Gate Pass
          </button>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="kanban-board">
          {STATUS_COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.key);
            return (
              <div key={col.key} className="kanban-col">
                <div className="kanban-col-header" style={{ borderTop: `3px solid ${col.color}` }}>
                  <div className="kanban-col-title">{col.label}</div>
                  <div className="kanban-col-count">{colOrders.length}</div>
                </div>

                <div className="kanban-col-body">
                  {colOrders.map((ord) => {
                    const extra = getOrderExtra(ord);
                    const customer = extra.Customer || extra['Customer Name'] || extra['Party Name'] || extra['Party'] || extra['Consignee'] || extra['Buyer'];
                    const destination = extra.Destination || extra['Destination City'] || extra['City'] || ord.zone;
                    const itemDesc = extra['Item Description'] || extra['Product'] || extra['Item'] || ord.skuList;

                    return (
                      <div
                        key={ord.id}
                        className="kanban-card"
                        onClick={() => handleOpenDetails(ord)}
                      >
                        <div className="kanban-card-header">
                          <span className="kanban-card-title">{ord.orderNo}</span>
                          <span className={`priority-tag ${ord.priority}`}>
                            {ord.priority}
                          </span>
                        </div>

                        {/* Customer from Excel */}
                        {customer && (
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                            🏢 {customer}
                          </div>
                        )}

                        {/* Destination or Zone */}
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                          📍 {destination || 'Location not set'}
                        </div>

                        {/* Item snippet from Excel */}
                        {itemDesc && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📦 {itemDesc}
                          </div>
                        )}

                        {ord.dockBay && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--accent-amber)', marginBottom: '0.35rem', fontWeight: 600 }}>
                            ⚓ {ord.dockBay}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', borderTop: '1px dotted var(--border-color)', paddingTop: '0.35rem' }}>
                          <span>{ord.boxCount} Pkg · {ord.weightKg ? `${ord.weightKg}kg` : '—'}</span>
                          <span className="mono">{ord.transporter ? ord.transporter : 'Unassigned'}</span>
                        </div>
                      </div>
                    );
                  })}

                  {colOrders.length === 0 && !loading && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No orders in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dynamic Operations Table View */}
      {viewMode === 'table' && (
        <div className="ledger-table-container">
          <table className="ledger-table" style={{ margin: 0, minWidth: '950px' }}>
            <thead>
              <tr>
                <th style={{ width: '42px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.length === orders.length}
                    onChange={toggleSelectAll}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                </th>
                {visibleCols.map(colId => (
                  <th key={colId} style={{ whiteSpace: 'nowrap' }}>
                    {getColLabel(colId)}
                  </th>
                ))}
                <th style={{ textAlign: 'center', width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: '0.5rem' }}>⏳</span>
                    Loading warehouse records...
                  </td>
                </tr>
              )}
              {!loading && orders.map((ord) => (
                <tr key={ord.id} style={{ background: selectedIds.includes(ord.id) ? 'rgba(37, 99, 235, 0.05)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ord.id)}
                      onChange={() => toggleSelectOrder(ord.id)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                    />
                  </td>
                  {visibleCols.map(colId => (
                    <td key={colId}>
                      {renderCell(ord, colId)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenDetails(ord)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.78rem',
                        borderRadius: 'var(--radius-pill)',
                        marginRight: '0.4rem',
                        background: '#eff6ff',
                        color: 'var(--accent-primary)',
                        border: '1px solid #bfdbfe'
                      }}
                      title="Inspect all imported Excel columns & specifications"
                    >
                      👁️ Details
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleOpenEdit(ord)}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.78rem',
                        borderRadius: 'var(--radius-pill)'
                      }}
                      title="Edit fulfillment status"
                    >
                      ✎ Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>No warehouse orders found</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Try clearing your search query or adjusting your stage filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Excel Spreadsheet View (100% Columns) */}
      {viewMode === 'sheet' && (
        <div style={{ overflowX: 'auto', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', borderRadius: '2px' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-paper-darker)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              📑 Complete Raw Spreadsheet Data Grid ({orders.length} Rows · {allDiscoveredExcelCols.length + 8} Columns)
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Scroll horizontally to view all original sheet attributes
            </span>
          </div>
          <table className="manifest-table" style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                <th>Order ID</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Customer / Party</th>
                <th>Destination / City</th>
                <th>Transporter</th>
                <th>Invoice No</th>
                <th>LR No</th>
                {allDiscoveredExcelCols.map(colKey => (
                  <th key={colKey} className="mono" style={{ background: 'rgba(61,90,128,0.04)' }}>
                    {colKey}
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord, idx) => {
                const extra = getOrderExtra(ord);
                const cust = extra.Customer || extra['Customer Name'] || extra['Party Name'] || extra['Party'] || extra['Consignee'] || '—';
                const dest = extra.Destination || extra['Destination City'] || extra['City'] || ord.zone || '—';

                return (
                  <tr key={ord.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>
                      <span
                        className="mono"
                        onClick={() => handleOpenDetails(ord)}
                        style={{ cursor: 'pointer', color: 'var(--accent-blue)', textDecoration: 'underline' }}
                      >
                        {ord.orderNo}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${ord.status}`}>{ord.status.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <span className={`priority-tag ${ord.priority}`}>{ord.priority}</span>
                    </td>
                    <td><strong>{cust}</strong></td>
                    <td>{dest}</td>
                    <td>{ord.transporter || '—'}</td>
                    <td className="mono">{ord.invoiceNo || '—'}</td>
                    <td className="mono">{ord.lrNo || '—'}</td>
                    {allDiscoveredExcelCols.map(colKey => (
                      <td key={colKey}>
                        {extra[colKey] !== undefined ? String(extra[colKey]) : '—'}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn-accent"
                        onClick={() => handleOpenDetails(ord)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comprehensive Order Master Inspector & Editor Modal */}
      {editModalOpen && selectedOrder && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-dialog" style={{ maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0' }}>
                  Order Master: <span className="mono">{selectedOrder.orderNo}</span>
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Registered {new Date(selectedOrder.enteredAt).toLocaleString()} by {selectedOrder.enteredBy || 'System'}
                </div>
              </div>
              <button className="secondary" onClick={() => setEditModalOpen(false)} style={{ padding: '0.2rem 0.5rem' }}>✕</button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', marginTop: '1rem', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setModalTab('excel')}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: modalTab === 'excel' ? 'var(--text-main)' : 'transparent',
                  color: modalTab === 'excel' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px'
                }}
              >
                📋 Excel Sheet Attributes ({Object.keys(getOrderExtra(selectedOrder)).length})
              </button>

              <button
                type="button"
                onClick={() => setModalTab('edit')}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: modalTab === 'edit' ? 'var(--text-main)' : 'transparent',
                  color: modalTab === 'edit' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px'
                }}
              >
                ✎ Edit Master Fields
              </button>

              <button
                type="button"
                onClick={() => setModalTab('timeline')}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: modalTab === 'timeline' ? 'var(--text-main)' : 'transparent',
                  color: modalTab === 'timeline' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px'
                }}
              >
                🕒 Audit History ({selectedOrder.events?.length || 0})
              </button>
            </div>

            {/* Modal Body Container with scrolling */}
            <div style={{ overflowY: 'auto', padding: '1rem 0', flex: 1 }}>
              {/* TAB 1: ALL EXCEL ATTRIBUTES */}
              {modalTab === 'excel' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Filter attributes..."
                      value={attrSearch}
                      onChange={(e) => setAttrSearch(e.target.value)}
                      style={{ maxWidth: '260px', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={copyExcelAttributesToClipboard}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      >
                        {copySuccess ? '✓ Copied JSON' : '📋 Copy All as JSON'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setModalTab('edit')}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      >
                        ✎ Edit Order
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const extra = getOrderExtra(selectedOrder);
                    const entries = Object.entries(extra).filter(([k, v]) => {
                      if (!attrSearch.trim()) return true;
                      const q = attrSearch.toLowerCase();
                      return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
                    });

                    if (entries.length === 0) {
                      return (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-paper-darker)' }}>
                          No attributes match your filter.
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.75rem' }}>
                        {entries.map(([k, v]) => (
                          <div
                            key={k}
                            style={{
                              padding: '0.75rem',
                              background: 'var(--bg-paper-darker)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '2px'
                            }}
                          >
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                              {k}
                            </div>
                            <div className="mono" style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                              {String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: EDIT MASTER FORM */}
              {modalTab === 'edit' && (
                <form onSubmit={handleSaveEdit} className="grid-2">
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Fulfillment Stage</label>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="RECEIVED">Received / Queued</option>
                      <option value="PICKING">Picking</option>
                      <option value="PACKING">Packing</option>
                      <option value="QUALITY_CHECK">QC Inspection</option>
                      <option value="STAGED">Staged at Dock</option>
                      <option value="DISPATCHED">Dispatched</option>
                      <option value="ON_HOLD">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Order Priority</label>
                    <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                      <option value="STANDARD">Standard</option>
                      <option value="EXPRESS">Express</option>
                      <option value="URGENT">Urgent (High Priority)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Storage Zone / Rack / Bin</label>
                    <input type="text" value={editForm.zone} onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Staging Dock / Bay Door</label>
                    <input type="text" value={editForm.dockBay} onChange={(e) => setEditForm({ ...editForm, dockBay: e.target.value })} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Transporter / Carrier</label>
                    <input type="text" value={editForm.transporter} onChange={(e) => setEditForm({ ...editForm, transporter: e.target.value })} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Truck / Vehicle Plate No.</label>
                    <input type="text" value={editForm.vehicleNo} onChange={(e) => setEditForm({ ...editForm, vehicleNo: e.target.value })} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Package Boxes &amp; Weight (kg)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="number" min="1" value={editForm.boxCount} onChange={(e) => setEditForm({ ...editForm, boxCount: e.target.value })} style={{ width: '45%' }} />
                      <input type="number" step="0.01" value={editForm.weightKg} onChange={(e) => setEditForm({ ...editForm, weightKg: e.target.value })} style={{ width: '55%' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Invoice &amp; LR Number</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type="text" placeholder="Invoice" value={editForm.invoiceNo} onChange={(e) => setEditForm({ ...editForm, invoiceNo: e.target.value })} />
                      <input type="text" placeholder="LR Number" value={editForm.lrNo} onChange={(e) => setEditForm({ ...editForm, lrNo: e.target.value })} />
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Special Instructions / Remarks</label>
                    <textarea rows="2" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="submit" style={{ flex: 1, minWidth: '140px' }}>SAVE CHANGES</button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => printThermalLabel(editForm)}
                      title="Print 4x6 inch thermal shipping barcode label"
                    >
                      🏷️ Print 4x6-Inch Label
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => printDeliveryChallan(editForm)}
                      title="Print official delivery challan"
                    >
                      📄 Delivery Challan
                    </button>
                    <button type="button" className="secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
                  </div>
                </form>
              )}

              {/* TAB 3: AUDIT HISTORY */}
              {modalTab === 'timeline' && (
                <div>
                  {(!selectedOrder.events || selectedOrder.events.length === 0) ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No events recorded for this order yet.
                    </div>
                  ) : (
                    <div className="timeline-list">
                      {selectedOrder.events.map((ev) => (
                        <div key={ev.id} className="timeline-item" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={`status-badge ${ev.status}`}>{ev.status.replace('_', ' ')}</span>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ev.actorName}</span>
                            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {new Date(ev.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {ev.note && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              {ev.note}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch / Bulk Operations Modal */}
      {bulkModalOpen && (
        <div className="modal-overlay" onClick={() => setBulkModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⚡ Bulk Process {selectedIds.length} Selected Orders</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0 1rem' }}>
              Apply batch fulfillment status updates or freight assignments.
            </p>
            <hr />

            <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Target Status</label>
                <select value={bulkActionType} onChange={(e) => setBulkActionType(e.target.value)}>
                  <option value="PICKING">Batch: Start Picking</option>
                  <option value="PACKING">Batch: Mark Packed</option>
                  <option value="QUALITY_CHECK">Batch: Pass QC Inspection</option>
                  <option value="STAGED">Batch: Stage at Loading Dock</option>
                  <option value="DISPATCHED">Batch: Dispatch &amp; Handover</option>
                  <option value="ON_HOLD">Batch: Put on Hold</option>
                </select>
              </div>

              {bulkActionType === 'STAGED' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Assign Dock Bay</label>
                  <input type="text" placeholder="e.g. Outbound Bay 4" value={bulkDock} onChange={(e) => setBulkDock(e.target.value)} />
                </div>
              )}

              {bulkActionType === 'DISPATCHED' && (
                <div className="grid-2">
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Transporter / Carrier</label>
                    <input type="text" placeholder="e.g. BlueDart" value={bulkTransporter} onChange={(e) => setBulkTransporter(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Truck / Vehicle Plate</label>
                    <input type="text" placeholder="e.g. MH-12-PQ-9999" value={bulkVehicle} onChange={(e) => setBulkVehicle(e.target.value)} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" style={{ flex: 1 }}>APPLY TO {selectedIds.length} ORDERS</button>
                <button type="button" className="secondary" onClick={() => setBulkModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Gate Pass Modal */}
      {gatePassOpen && (
        <div className="modal-overlay" onClick={() => setGatePassOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="printable-area" style={{ border: '2px solid #000', padding: '2rem', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.4rem' }}>WAREHOUSE OUTBOUND GATE PASS</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>SECURITY &amp; DISPATCH CLEARANCE CHALLAN</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>GATE PASS CLEARANCE</div>
                  <div style={{ fontSize: '0.85rem' }}>Date: {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ margin: '1rem 0', fontSize: '0.9rem' }}>
                <strong>Clearance Orders ({selectedIds.length > 0 ? selectedIds.length : orders.length} Total):</strong>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', margin: '1rem 0', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Order No</th>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Status</th>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Carrier</th>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Truck Plate</th>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Boxes</th>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedIds.length > 0 ? orders.filter(o => selectedIds.includes(o.id)) : orders.slice(0, 15)).map(o => (
                    <tr key={o.id}>
                      <td style={{ border: '1px solid #000', padding: '6px' }}>{o.orderNo}</td>
                      <td style={{ border: '1px solid #000', padding: '6px' }}>{o.status}</td>
                      <td style={{ border: '1px solid #000', padding: '6px' }}>{o.transporter || '—'}</td>
                      <td style={{ border: '1px solid #000', padding: '6px' }}>{o.vehicleNo || '—'}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{o.boxCount}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{o.weightKg || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', paddingTop: '1rem', borderTop: '1px dotted #000', fontSize: '0.85rem' }}>
                <div>
                  Warehouse Manager: __________________<br />
                  <small>Authorized Signature &amp; Stamp</small>
                </div>
                <div>
                  Security Gate Clearance: __________________<br />
                  <small>Vehicle Check &amp; Departure</small>
                </div>
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={() => window.print()} style={{ flex: 1 }}>
                🖨️ PRINT GATE PASS
              </button>
              <button className="secondary" onClick={() => setGatePassOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {scannerOpen && (
        <BarcodeScanner
          title="Scan Order Barcode / AWB"
          onScan={(code) => {
            setSearch(code);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dedicated Export Center (LogiFlow Brand)
// ─────────────────────────────────────────────────────────────
function ExportTab() {
  const [downloading, setDownloading] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [stats, setStats] = useState({ totalOrders: 0, totalWorkers: 0, loading: true });

  useEffect(() => {
    async function loadStats() {
      try {
        const [resOrders, resUsers] = await Promise.all([
          fetch('/api/orders?limit=1'),
          fetch('/api/users')
        ]);
        const oData = await resOrders.json();
        const uData = await resUsers.json();
        setStats({
          totalOrders: oData.total || (Array.isArray(oData.orders) ? oData.orders.length : 0),
          totalWorkers: Array.isArray(uData.workers) ? uData.workers.length : 0,
          loading: false
        });
      } catch {
        setStats(prev => ({ ...prev, loading: false }));
      }
    }
    loadStats();
  }, []);

  const handleExportOrders = () => {
    setDownloading('orders');
    const link = document.createElement('a');
    link.href = '/api/export';
    link.setAttribute('download', `logiflow_orders_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(''), 1500);
  };

  const handleExportWorkers = () => {
    setDownloading('workers');
    window.open('/api/users', '_blank');
    setTimeout(() => setDownloading(''), 1500);
  };

  const handleExportLogs = () => {
    setDownloading('logs');
    window.open('/api/logs?limit=500', '_blank');
    setTimeout(() => setDownloading(''), 1500);
  };

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '1100px', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Export &amp; Data Hub
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '0.35rem' }}>
          Download high-fidelity operational datasets, live warehouse manifests, and worker telemetry records.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid-3" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-label">Orders Ready to Export</div>
          <div className="stat-value">{stats.loading ? '...' : stats.totalOrders.toLocaleString()}</div>
          <div className="stat-meta">Includes all fulfillment stages</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-label">Worker Profiles &amp; Roles</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.loading ? '...' : stats.totalWorkers}</div>
          <div className="stat-meta">Registered warehouse accounts</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-label">Database Export Status</div>
          <div className="stat-value" style={{ color: '#10b981', fontSize: '1.6rem', marginTop: '0.4rem' }}>
            ● Healthy
          </div>
          <div className="stat-meta">Direct SQLite / ORM stream ready</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Date Range:</span>
          {['all', 'today', 'week', 'month'].map(period => (
            <button
              key={period}
              type="button"
              onClick={() => setDateFilter(period)}
              className={dateFilter === period ? 'btn-accent' : 'secondary'}
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', textTransform: 'capitalize' }}
            >
              {period === 'all' ? 'All Time' : period === 'week' ? 'Past 7 Days' : period === 'month' ? 'This Month' : 'Today'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Output formats supported: <strong>.xlsx</strong>, <strong>.csv</strong>, <strong>.json</strong>
        </div>
      </div>

      {/* Export Cards Grid */}
      <div className="grid-3">
        {/* Card 1: Orders Manifest */}
        <div className="export-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📦</span>
              <span className="export-badge" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
                EXCEL (.XLSX)
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Complete Orders Manifest
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Full detailed dataset containing all customer orders, SKU barcodes, dispatch stages, and package counts.
            </p>
          </div>
          <button
            type="button"
            className="btn-accent"
            onClick={handleExportOrders}
            disabled={downloading === 'orders'}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {downloading === 'orders' ? '⏳ Generating...' : '📥 Download Excel Manifest'}
          </button>
        </div>

        {/* Card 2: Worker Activity */}
        <div className="export-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>👥</span>
              <span className="export-badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                JSON / CSV
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Worker Accounts &amp; Roles
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Export complete list of registered floor staff, permission matrices, and last active authentication timestamps.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={handleExportWorkers}
            disabled={downloading === 'workers'}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {downloading === 'workers' ? '⏳ Opening...' : '📋 Export Worker Roster'}
          </button>
        </div>

        {/* Card 3: Audit Logs */}
        <div className="export-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>📋</span>
              <span className="export-badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>
                AUDIT LOG
              </span>
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              System Audit &amp; Event Logs
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Warehouse floor event log including scan verifications, package stage transitions, and upload activity.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={handleExportLogs}
            disabled={downloading === 'logs'}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {downloading === 'logs' ? '⏳ Exporting...' : '📄 Export Event Logs'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Workers & Permissions Tab
// ─────────────────────────────────────────
function WorkersTab() {
  const [workers, setWorkers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [workerSubView, setWorkerSubView] = useState('roster'); // 'roster' | 'live'
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editWorker, setEditWorker] = useState(null);
  const [form, setForm] = useState({
    username: '',
    name: '',
    password: '',
    canViewOrders: true,
    canPickPack: true,
    canDispatch: false,
    canUpload: false,
    canExport: false,
    canViewLogs: false,
    isActive: true,
  });
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const fetchWorkers = async () => {
    setLoading(true);
    try {
      const [resUsers, resAct] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/activity')
      ]);
      const data = await resUsers.json();
      const actData = await resAct.json();
      if (resUsers.ok) setWorkers(data.workers || []);
      if (resAct.ok) setActivities(actData.activities || []);
    } catch {
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [resUsers, resAct] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/activity')
        ]);
        const data = await resUsers.json();
        const actData = await resAct.json();
        if (!ignore && resUsers.ok) setWorkers(data.workers || []);
        if (!ignore && resAct.ok) setActivities(actData.activities || []);
      } catch {
        if (!ignore) setWorkers([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  const openCreateModal = () => {
    setEditWorker(null);
    setForm({
      username: '',
      name: '',
      password: '',
      canViewOrders: true,
      canPickPack: true,
      canDispatch: false,
      canUpload: false,
      canExport: false,
      canViewLogs: false,
      isActive: true,
    });
    setMsg('');
    setModalOpen(true);
  };

  const openEditModal = (worker) => {
    setEditWorker(worker);
    setForm({
      username: worker.username,
      name: worker.name,
      password: '',
      canViewOrders: worker.canViewOrders,
      canPickPack: worker.canPickPack,
      canDispatch: worker.canDispatch,
      canUpload: worker.canUpload,
      canExport: worker.canExport,
      canViewLogs: worker.canViewLogs,
      isActive: worker.isActive,
    });
    setMsg('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const method = editWorker ? 'PUT' : 'POST';
      const payload = editWorker
        ? { id: editWorker.id, ...form }
        : form;

      const res = await fetch('/api/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        setModalOpen(false);
        fetchWorkers();
      } else {
        setMsg(data.error || 'Failed to save worker');
        setIsError(true);
      }
    } catch {
      setMsg('Connection error saving worker');
      setIsError(true);
    }
  };

  const handleDelete = async (worker) => {
    if (!confirm(`Are you sure you want to delete worker "${worker.name}" (@${worker.username})?`)) return;
    try {
      const res = await fetch(`/api/users?id=${worker.id}`, { method: 'DELETE' });
      if (res.ok) fetchWorkers();
    } catch {}
  };

  const onlineWorkersCount = activities.filter(a => a.isOnline).length || workers.filter(w => w.isActive).length;

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '1100px', padding: '1.5rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Workers &amp; Access Controls
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.35rem' }}>
            Manage worker accounts, credentials, and floor task clearances.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ background: 'var(--border-subtle)', borderRadius: '6px', padding: '0.2rem', display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              className={workerSubView === 'roster' ? 'btn-accent' : 'btn-ghost'}
              onClick={() => setWorkerSubView('roster')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              👥 Staff Roster
            </button>
            <button
              type="button"
              className={workerSubView === 'live' ? 'btn-accent' : 'btn-ghost'}
              onClick={() => setWorkerSubView('live')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              🟢 Floor Telemetry ({activities.filter(a => a.isOnline).length})
            </button>
          </div>
          <button type="button" className="btn-accent" onClick={openCreateModal}>
            ➕ Add New Worker
          </button>
        </div>
      </div>

      {/* Spacious Un-Clustered KPI Stat Cards */}
      <div className="grid-3" style={{ margin: '1.75rem 0' }}>
        <div className="stat-card">
          <div className="stat-label">Total Assigned Workers</div>
          <div className="stat-value">{workers.length}</div>
          <div className="stat-meta">Managed by your admin account</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-label">Active / Online Right Now</div>
          <div className="stat-value" style={{ color: '#10b981' }}>
            {onlineWorkersCount}
          </div>
          <div className="stat-meta">Pinging live floor heartbeat</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="stat-label">Operations Clearance</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>
            {workers.filter(w => w.canPickPack).length}
          </div>
          <div className="stat-meta">Cleared for picking &amp; packing</div>
        </div>
      </div>

      {/* Sub-view: Live Floor Telemetry */}
      {workerSubView === 'live' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Live Warehouse Floor Feed</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                Real-time heartbeat &amp; latest scanned item telemetry.
              </p>
            </div>
            <button type="button" className="secondary" onClick={fetchWorkers} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
              🔄 Refresh Stream
            </button>
          </div>

          <div className="grid-2">
            {loading && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Connecting to live telemetry feed...
              </div>
            )}
            {!loading && activities.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                No active floor telemetry right now. Workers appear here when they log in to the floor terminal.
              </div>
            )}
            {!loading && activities.map((w) => (
              <div key={w.id} className="worker-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={`status-dot ${w.isOnline ? 'online' : 'offline'}`} />
                      <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{w.name}</span>
                    </div>
                    <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{w.username}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                      background: w.isOnline ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.06)',
                      color: w.isOnline ? '#059669' : 'var(--text-muted)'
                    }}>
                      {w.isOnline ? '🟢 ONLINE NOW' : '⚪ IDLE'}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {w.todayOperationsCount || 0} actions today
                    </div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-canvas)',
                  padding: '0.65rem 0.85rem',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Latest Live Telemetry:
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                    {w.lastAction || 'No recent activity recorded'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-view: Staff Roster Table */}
      {workerSubView === 'roster' && (
      <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
        <table className="manifest-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Worker Name</th>
              <th>Username</th>
              <th>Access Permissions</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading worker accounts...
                </td>
              </tr>
            )}
            {!loading && workers.map((w) => (
              <tr key={w.id} style={{ opacity: w.isActive ? 1 : 0.6 }}>
                <td>
                  <span style={{
                    padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                    background: w.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    color: w.isActive ? '#059669' : '#dc2626'
                  }}>
                    {w.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td><span className="mono">@{w.username}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    <span className={`permission-chip ${w.canViewOrders ? 'granted' : 'denied'}`}>
                      {w.canViewOrders ? '✓' : '✗'} View Orders
                    </span>
                    <span className={`permission-chip ${w.canPickPack ? 'granted' : 'denied'}`}>
                      {w.canPickPack ? '✓' : '✗'} Pick/Pack
                    </span>
                    <span className={`permission-chip ${w.canDispatch ? 'granted' : 'denied'}`}>
                      {w.canDispatch ? '✓' : '✗'} Dispatch
                    </span>
                    <span className={`permission-chip ${w.canUpload ? 'granted' : 'denied'}`}>
                      {w.canUpload ? '✓' : '✗'} Upload Excel
                    </span>
                    <span className={`permission-chip ${w.canExport ? 'granted' : 'denied'}`}>
                      {w.canExport ? '✓' : '✗'} Export
                    </span>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {w.lastSeen ? new Date(w.lastSeen).toLocaleString() : 'Never'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openEditModal(w)}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                    >
                      ✎ Edit
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleDelete(w)}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && workers.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No workers found. Click &quot;Add New Worker&quot; to create your first worker account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Add / Edit Worker Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h3>{editWorker ? `Edit Worker: ${editWorker.name}` : 'Register New Warehouse Worker'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.3rem 0 1rem' }}>
              Set credentials and assign specific task clearances.
            </p>
            <hr />

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. John Doe (Station 4)"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. jdoe_pk"
                    disabled={!!editWorker}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>
                  {editWorker ? 'New Password (leave blank to keep unchanged)' : 'Initial Password'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editWorker ? '••••••••' : 'Enter strong password'}
                  required={!editWorker}
                />
              </div>

              <div style={{ background: 'var(--bg-paper)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '2px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Permission Matrix
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canViewOrders}
                      onChange={(e) => setForm({ ...form, canViewOrders: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>📦 View Orders</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canPickPack}
                      onChange={(e) => setForm({ ...form, canPickPack: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>🛠️ Pick &amp; Pack Orders</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canDispatch}
                      onChange={(e) => setForm({ ...form, canDispatch: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>🚚 Mark Dispatched</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canUpload}
                      onChange={(e) => setForm({ ...form, canUpload: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>📑 Upload Excel</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canExport}
                      onChange={(e) => setForm({ ...form, canExport: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>📥 Export Manifests</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.canViewLogs}
                      onChange={(e) => setForm({ ...form, canViewLogs: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>📜 View System Logs</span>
                  </label>
                </div>
              </div>

              {editWorker && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      style={{ width: 'auto' }}
                    />
                    <span>Account Active (Uncheck to temporarily suspend terminal access)</span>
                  </label>
                </div>
              )}

              {msg && (
                <div style={{
                  padding: '0.75rem', borderRadius: '2px', fontWeight: 600,
                  background: isError ? 'rgba(178,74,53,0.1)' : 'rgba(58,122,81,0.1)',
                  border: `1px solid ${isError ? 'var(--accent-rust)' : 'var(--accent-green)'}`,
                  color: isError ? 'var(--accent-rust)' : 'var(--accent-green)'
                }}>
                  {msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" style={{ flex: 1 }}>{editWorker ? 'SAVE PERMISSIONS' : 'CREATE WORKER'}</button>
                <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Live Worker Activity Monitoring Tab
// ─────────────────────────────────────────
function LiveActivityTab() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchActivity = async () => {
    try {
      const res = await fetch('/api/activity');
      const data = await res.json();
      if (res.ok) {
        setActivities(data.activities || []);
        setLastRefreshed(new Date());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/activity');
        const data = await res.json();
        if (!ignore && res.ok) {
          setActivities(data.activities || []);
          setLastRefreshed(new Date());
        }
      } catch {
        if (!ignore) setActivities([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();

    // Auto-polling every 15 seconds
    const interval = setInterval(() => {
      fetchActivity();
    }, 15000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const onlineCount = activities.filter(a => a.isOnline).length;
  const totalOpsToday = activities.reduce((acc, a) => acc + (a.todayOperationsCount || 0), 0);

  return (
    <div>
      {/* Activity KPI Cards */}
      <div className="grid-3" style={{ marginBottom: '1.75rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Assigned Workers</div>
          <div className="stat-value">{activities.length}</div>
          <div className="stat-meta">Managed by your admin account</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #2ecc71' }}>
          <div className="stat-label">Active / Online Right Now</div>
          <div className="stat-value" style={{ color: '#2ecc71' }}>
            {onlineCount}
          </div>
          <div className="stat-meta">Pinging live heartbeat</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
          <div className="stat-label">Total Operations Today</div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            {totalOpsToday}
          </div>
          <div className="stat-meta">Picks, packs, QC, &amp; dispatches</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Live Warehouse Floor Feed</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Real-time feed updates automatically every 15 seconds. (Last sync: {lastRefreshed.toLocaleTimeString()})
          </p>
        </div>
        <button type="button" className="secondary" onClick={fetchActivity} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
          🔄 Refresh Stream
        </button>
      </div>

      {/* Worker Cards Grid */}
      <div className="grid-2">
        {loading && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Connecting to live telemetry feed...
          </div>
        )}
        {!loading && activities.map((w) => (
          <div key={w.id} className="worker-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={`status-dot ${w.isOnline ? 'online' : 'offline'}`} />
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{w.name}</span>
                </div>
                <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{w.username}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  padding: '0.15rem 0.5rem', borderRadius: '2px', fontSize: '0.75rem', fontWeight: 700,
                  background: w.isOnline ? 'rgba(46,204,113,0.15)' : 'rgba(0,0,0,0.06)',
                  color: w.isOnline ? '#27ae60' : 'var(--text-muted)'
                }}>
                  {w.isOnline ? '🟢 ONLINE NOW' : '⚪ IDLE / OFFLINE'}
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {w.todayOperationsCount || 0} actions today
                </div>
              </div>
            </div>

            {/* Current Action Banner */}
            <div style={{
              background: 'var(--bg-paper)',
              padding: '0.65rem 0.85rem',
              border: '1px solid var(--border-color)',
              borderRadius: '2px',
              marginBottom: '0.85rem',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                Latest Live Telemetry:
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                {w.lastAction || 'No recent activity recorded'}
              </div>
              {w.lastActionAt && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  🕒 {new Date(w.lastActionAt).toLocaleTimeString()} ({new Date(w.lastActionAt).toLocaleDateString()})
                </div>
              )}
            </div>

            {/* Recent 3 Actions mini timeline */}
            {w.recentEvents && w.recentEvents.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                  Recent Fulfillments:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {w.recentEvents.slice(0, 3).map((evt) => (
                    <div key={evt.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.3rem 0.5rem', background: 'var(--bg-paper-lighter)', border: '1px dotted var(--border-color)', borderRadius: '2px' }}>
                      <span className="mono"><strong>{evt.order?.orderNo || 'Order'}</strong> → {evt.status}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Upload Tab (Web Worker + Multi-Sheet + Full Viewer)
// ─────────────────────────────────────────
function UploadTab({ onViewOrders }) {
  const [file, setFile] = useState(null);
  const [fileBuffer, setFileBuffer] = useState(null); // raw ArrayBuffer retained for viewer
  const [sheetMeta, setSheetMeta] = useState([]);       // [{name, rowCount, headers}]
  const [selectedSheets, setSelectedSheets] = useState([]); // sheets to import (checkboxes)
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [customMapping, setCustomMapping] = useState({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const workerRef = useRef(null);

  // Full viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSheet, setViewerSheet] = useState('');
  const [viewerHeaders, setViewerHeaders] = useState([]);
  const [viewerRows, setViewerRows] = useState([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerSearch, setViewerSearch] = useState('');
  const [viewerScrollTop, setViewerScrollTop] = useState(0);
  const viewerContainerRef = useRef(null);

  const ROW_HEIGHT = 32;
  const VISIBLE_BUFFER = 10;

  // Compute which viewer rows are visible (virtualization)
  const filteredViewerRows = viewerSearch.trim()
    ? viewerRows.filter(row => row.some(cell => String(cell).toLowerCase().includes(viewerSearch.toLowerCase())))
    : viewerRows;
  const totalViewerRows = filteredViewerRows.length;
  const containerHeight = 500; // px
  const visibleStart = Math.max(0, Math.floor(viewerScrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
  const visibleEnd = Math.min(totalViewerRows, Math.ceil((viewerScrollTop + containerHeight) / ROW_HEIGHT) + VISIBLE_BUFFER);
  const visibleRows = filteredViewerRows.slice(visibleStart, visibleEnd);
  const paddingTop = visibleStart * ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalViewerRows - visibleEnd)) * ROW_HEIGHT;

  // Cleanup worker on unmount
  useEffect(() => {
    return () => { if (workerRef.current) workerRef.current.terminate(); };
  }, []);

  const spawnWorker = () => {
    if (workerRef.current) workerRef.current.terminate();
    const w = new Worker('/excelParser.worker.js');
    workerRef.current = w;
    return w;
  };

  const parseFileLocally = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
    setParseError('');
    setParsing(true);
    setSheetMeta([]);
    setSelectedSheets([]);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setViewerOpen(false);

    try {
      const buffer = await selectedFile.arrayBuffer();
      setFileBuffer(buffer);

      const worker = spawnWorker();
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'SHEET_LIST') {
          setParsing(false);
          setSheetMeta(msg.sheetMeta || []);
          // Default: all sheets selected
          setSelectedSheets((msg.sheetMeta || []).map(s => s.name));
          setPreviewHeaders(msg.previewHeaders || []);
          setPreviewRows(msg.previewRows || []);
          setTotalRows(msg.totalRows || 0);

          // Auto-mapping from first sheet headers
          const headers = msg.previewHeaders || [];
          const initialMapping = {};
          headers.forEach(h => {
            const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['orderno','orderid','order','pono','refno','referenceno','bookingno','consignmentno','docketno','awb','id','srno'].includes(norm)) {
              if (!Object.values(initialMapping).includes('orderNo')) initialMapping[h] = 'orderNo';
            } else if (['customer','customername','party','partyname','consignee','buyer','client'].includes(norm)) {
              if (!Object.values(initialMapping).includes('customer')) initialMapping[h] = 'customer';
            } else if (['destination','city','deliverycity','location','address','state'].includes(norm)) {
              if (!Object.values(initialMapping).includes('destination')) initialMapping[h] = 'destination';
            } else if (['item','items','product','sku','description','material'].includes(norm)) {
              if (!Object.values(initialMapping).includes('skuList')) initialMapping[h] = 'skuList';
            } else if (['transporter','carrier','courier','transport','logistics'].includes(norm)) {
              if (!Object.values(initialMapping).includes('transporter')) initialMapping[h] = 'transporter';
            } else if (['status','stage','fulfillment','shipmentstatus'].includes(norm)) {
              if (!Object.values(initialMapping).includes('status')) initialMapping[h] = 'status';
            } else if (['qty','quantity','boxes','cartons','boxcount','pieces','units'].includes(norm)) {
              if (!Object.values(initialMapping).includes('boxCount')) initialMapping[h] = 'boxCount';
            } else if (['invoice','invoiceno','billno','challan'].includes(norm)) {
              if (!Object.values(initialMapping).includes('invoiceNo')) initialMapping[h] = 'invoiceNo';
            } else if (['lr','lrno','docket','awb','trackingno','tracking'].includes(norm)) {
              if (!Object.values(initialMapping).includes('lrNo')) initialMapping[h] = 'lrNo';
            }
          });
          setCustomMapping(initialMapping);
        } else if (msg.type === 'SHEET_DATA') {
          setViewerHeaders(msg.headers || []);
          setViewerRows(msg.rows || []);
          setViewerLoading(false);
        } else if (msg.type === 'ERROR') {
          setParsing(false);
          setViewerLoading(false);
          setParseError(msg.message || 'Unknown parse error');
        }
      };
      worker.onerror = (err) => {
        setParsing(false);
        setViewerLoading(false);
        setParseError('Worker error: ' + (err.message || String(err)));
      };
      worker.postMessage({ type: 'PARSE_FILE', buffer }, [buffer]);
    } catch (err) {
      setParsing(false);
      setParseError('Failed to read file: ' + err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) parseFileLocally(dropped);
  };

  const handleMappingChange = (header, targetField) => {
    setCustomMapping(prev => {
      const updated = { ...prev };
      if (!targetField) { delete updated[header]; }
      else {
        Object.keys(updated).forEach(k => { if (updated[k] === targetField) delete updated[k]; });
        updated[header] = targetField;
      }
      return updated;
    });
  };

  const toggleSheet = (name) => {
    setSelectedSheets(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const openViewer = (shName) => {
    if (!fileBuffer || !workerRef.current) return;
    setViewerSheet(shName);
    setViewerRows([]);
    setViewerHeaders([]);
    setViewerSearch('');
    setViewerScrollTop(0);
    setViewerLoading(true);
    setViewerOpen(true);
    // Send a NEW buffer slice (worker consumes it)
    const copyBuffer = fileBuffer.slice(0);
    workerRef.current.postMessage({ type: 'GET_SHEET_DATA', buffer: copyBuffer, sheetName: shName }, [copyBuffer]);
  };

  const doUpload = async () => {
    if (!file || selectedSheets.length === 0) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetNames', JSON.stringify(selectedSheets));
    formData.append('mapping', JSON.stringify(customMapping));

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/upload', { method: 'POST', body: formData, headers });
      const data = await res.json();
      if (res.ok) {
        const totalImported = data.totalProcessed || (data.added + data.updated);
        setResult({
          ok: true,
          added: data.added,
          updated: data.updated,
          totalProcessed: totalImported,
          sheetsImported: data.sheetsImported || selectedSheets,
          msg: `Successfully imported ${totalImported} orders from ${(data.sheetsImported || selectedSheets).length} sheet(s) — ${data.added} new, ${data.updated} updated.`
        });
      } else {
        setResult({ ok: false, msg: `Error: ${data.error}` });
      }
    } catch {
      setResult({ ok: false, msg: 'Upload failed. Please check your network connection and try again.' });
    }
    setUploading(false);
  };

  const totalSelectedRows = sheetMeta
    .filter(s => selectedSheets.includes(s.name))
    .reduce((sum, s) => sum + s.rowCount, 0);

  return (
    <div style={{ margin: '0 auto', maxWidth: '1040px' }}>

      {/* Title */}
      <div style={{ marginBottom: '1.5rem', background: 'var(--bg-paper-lighter)', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>📦 Full-Data Excel Import Engine</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
          Upload any warehouse shipment sheet (.xlsx / .xls). All sheets scanned instantly — select which to import. 100% of columns retained. Supports 15,000+ row files without freezing.
        </p>
      </div>

      {/* Drop Zone */}
      {!file && !parsing && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            padding: '3.5rem 2rem',
            border: `2px dashed ${dragOver ? 'var(--accent-blue)' : 'var(--border-dark)'}`,
            background: dragOver ? 'rgba(61,90,128,0.06)' : 'var(--bg-paper-lighter)',
            textAlign: 'center', transition: 'all 0.2s ease', cursor: 'pointer', borderRadius: '2px'
          }}
          onClick={() => document.getElementById('excel-file-input').click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📊</div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Drop your Excel file here or click to browse</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Supports .xlsx and .xls — large files (13,000+ rows, multiple sheets) handled smoothly</p>
          <input id="excel-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files[0]) parseFileLocally(e.target.files[0]); }} />
        </div>
      )}

      {/* Parsing Spinner */}
      {parsing && (
        <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>Scanning file in background…</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>Reading sheet structure without freezing your browser</div>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div style={{ padding: '1rem', background: 'rgba(178,74,53,0.08)', border: '1px solid var(--accent-rust)', borderRadius: '2px', color: 'var(--accent-rust)', fontWeight: 600 }}>
          ❌ {parseError}
          <button className="secondary" style={{ marginLeft: '1rem', padding: '0.3rem 0.7rem' }} onClick={() => { setFile(null); setParseError(''); }}>Try Again</button>
        </div>
      )}

      {/* File loaded — main UI */}
      {file && !parsing && sheetMeta.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* File info bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.25rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>📄 {file.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {(file.size / 1024).toFixed(1)} KB · <strong>{sheetMeta.length}</strong> Sheet{sheetMeta.length > 1 ? 's' : ''} · <strong>{sheetMeta.reduce((s, m) => s + m.rowCount, 0).toLocaleString()}</strong> Total Data Rows
              </div>
            </div>
            <button className="secondary" onClick={() => { setFile(null); setFileBuffer(null); setSheetMeta([]); setResult(null); setViewerOpen(false); }} style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}>
              Change File
            </button>
          </div>

          {/* Sheet Selection */}
          <div style={{ padding: '1.25rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)' }}>
            <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
              📋 Select Sheets to Import
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
              {sheetMeta.map(sm => (
                <label key={sm.name} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.75rem 1rem', background: selectedSheets.includes(sm.name) ? 'rgba(61,90,128,0.06)' : 'var(--bg-paper-darker)', border: `1px solid ${selectedSheets.includes(sm.name) ? 'var(--accent-blue)' : 'var(--border-color)'}`, borderRadius: '2px', cursor: 'pointer', transition: 'all 0.15s ease' }}>
                  <input type="checkbox" checked={selectedSheets.includes(sm.name)} onChange={() => toggleSheet(sm.name)} style={{ marginTop: '2px', accentColor: 'var(--accent-blue)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{sm.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      <strong>{sm.rowCount.toLocaleString()}</strong> rows · <strong>{sm.headers.length}</strong> columns
                    </div>
                    {sm.headers.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={sm.headers.join(', ')}>
                        {sm.headers.slice(0, 4).join(', ')}{sm.headers.length > 4 ? ` +${sm.headers.length - 4} more` : ''}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    title={`View full sheet: ${sm.name}`}
                    onClick={(e) => { e.preventDefault(); openViewer(sm.name); }}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: 'var(--bg-paper)', border: '1px solid var(--border-color)', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap' }}
                  >
                    👁 View
                  </button>
                </label>
              ))}
            </div>
            {selectedSheets.length > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.83rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                ✓ {selectedSheets.length} sheet{selectedSheets.length > 1 ? 's' : ''} selected · {totalSelectedRows.toLocaleString()} rows will be imported
              </div>
            )}
          </div>

          {/* Column Mapping */}
          <div style={{ padding: '1.25rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>⚡ Column Mapping (from first selected sheet)</h4>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Same mapping applied to all selected sheets</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {[
                { label: 'Order ID / Ref No', key: 'orderNo', required: true },
                { label: 'Customer / Party Name', key: 'customer' },
                { label: 'Destination / City', key: 'destination' },
                { label: 'Item / SKU Description', key: 'skuList' },
                { label: 'Transporter / Carrier', key: 'transporter' },
                { label: 'Fulfillment Status', key: 'status' },
                { label: 'Quantity / Box Count', key: 'boxCount' },
                { label: 'Invoice Number', key: 'invoiceNo' },
                { label: 'LR / Tracking / AWB', key: 'lrNo' },
              ].map(field => {
                const assignedHeader = Object.keys(customMapping).find(k => customMapping[k] === field.key) || '';
                return (
                  <div key={field.key} style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-paper-darker)', borderRadius: '2px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      {field.label} {field.required && <span style={{ color: 'var(--accent-rust)' }}>*</span>}
                    </div>
                    <select
                      value={assignedHeader}
                      onChange={(e) => handleMappingChange(e.target.value, field.key)}
                      style={{ width: '100%', fontSize: '0.8rem', padding: '0.3rem 0.5rem', background: 'var(--bg-paper-lighter)' }}
                    >
                      <option value="">-- Unassigned (Auto) --</option>
                      {previewHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Preview (first 20 rows of first selected sheet) */}
          {previewHeaders.length > 0 && (
            <div style={{ background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Preview — First {Math.min(previewRows.length, 20)} of {totalRows.toLocaleString()} Rows</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{previewHeaders.length} columns detected</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '220px', overflowY: 'auto' }}>
                <table className="manifest-table" style={{ margin: 0, fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                      {previewHeaders.map(h => (
                        <th key={h} style={{ whiteSpace: 'nowrap' }}>
                          {h}
                          {customMapping[h] && (
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--accent-blue)', fontWeight: 'normal' }}>→ {customMapping[h]}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        {previewHeaders.map((h, colIdx) => (
                          <td key={colIdx} style={{ whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[colIdx] !== undefined && row[colIdx] !== null && row[colIdx] !== '' ? String(row[colIdx]) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Button */}
          {!uploading && !result && selectedSheets.length > 0 && (
            <button
              onClick={doUpload}
              style={{ padding: '0.85rem 1.5rem', fontSize: '1rem', fontWeight: 700, background: 'var(--text-main)', color: 'var(--bg-paper-lighter)', cursor: 'pointer' }}
            >
              📥 IMPORT {totalSelectedRows.toLocaleString()} ROWS FROM {selectedSheets.length} SHEET{selectedSheets.length > 1 ? 'S' : ''}
            </button>
          )}
          {!uploading && !result && selectedSheets.length === 0 && (
            <div style={{ padding: '0.85rem', background: 'rgba(178,74,53,0.07)', border: '1px solid var(--accent-rust)', color: 'var(--accent-rust)', fontWeight: 600, fontSize: '0.9rem' }}>
              ⚠️ Select at least one sheet to import.
            </div>
          )}

          {/* Uploading state */}
          {uploading && (
            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', fontWeight: 600 }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚡</div>
              Ingesting {totalSelectedRows.toLocaleString()} records from {selectedSheets.length} sheet{selectedSheets.length > 1 ? 's' : ''}…
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem', fontWeight: 400 }}>Using batch import — this should be very fast.</div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ padding: '1.25rem', background: result.ok ? 'rgba(58,122,81,0.08)' : 'rgba(178,74,53,0.08)', border: `1px solid ${result.ok ? 'var(--accent-green)' : 'var(--accent-rust)'}`, borderRadius: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem', color: result.ok ? 'var(--accent-green)' : 'var(--accent-rust)' }}>
                <span>{result.ok ? '✅' : '❌'}</span>
                <span>{result.msg}</span>
              </div>
              {result.ok && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  <div>• <strong>{result.added}</strong> new warehouse orders registered.</div>
                  <div>• <strong>{result.updated}</strong> existing orders merged and updated.</div>
                  <div>• <strong>0</strong> rows dropped or lost.</div>
                  <div>• Imported from sheets: <strong>{(result.sheetsImported || []).join(', ')}</strong></div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    {onViewOrders && (
                      <button onClick={onViewOrders} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 700 }}>
                        🚀 View Orders in Operations Table
                      </button>
                    )}
                    <button className="secondary" onClick={() => { setFile(null); setFileBuffer(null); setSheetMeta([]); setResult(null); setViewerOpen(false); }} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                      Import Another File
                    </button>
                  </div>
                </div>
              )}
              {!result.ok && (
                <button className="secondary" style={{ marginTop: '0.75rem' }} onClick={() => setResult(null)}>Try Again</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Full Sheet Viewer Modal ─────────────────────────────────────── */}
      {viewerOpen && (
        <div
          className="modal-overlay"
          onClick={() => setViewerOpen(false)}
          style={{ zIndex: 2000 }}
        >
          <div
            className="modal-dialog"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '95vw', width: '1200px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Viewer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>📊 Full Sheet Viewer — {viewerSheet}</h3>
                {!viewerLoading && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {filteredViewerRows.length.toLocaleString()}{viewerSearch ? ` filtered` : ''} of {viewerRows.length.toLocaleString()} rows · {viewerHeaders.length} columns
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search rows…"
                  value={viewerSearch}
                  onChange={e => { setViewerSearch(e.target.value); setViewerScrollTop(0); if (viewerContainerRef.current) viewerContainerRef.current.scrollTop = 0; }}
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', width: '200px' }}
                />
                <button type="button" className="secondary" onClick={() => setViewerOpen(false)} style={{ padding: '0.4rem 0.85rem' }}>✕ Close</button>
              </div>
            </div>

            {/* Sheet Tabs */}
            {sheetMeta.length > 1 && (
              <div style={{ display: 'flex', gap: '0', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                {sheetMeta.map(sm => (
                  <button
                    key={sm.name}
                    type="button"
                    onClick={() => openViewer(sm.name)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: sm.name === viewerSheet ? 'var(--text-main)' : 'transparent',
                      color: sm.name === viewerSheet ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderBottom: sm.name === viewerSheet ? 'none' : '1px solid var(--border-color)',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                    }}
                  >
                    {sm.name} <span style={{ opacity: 0.65, fontWeight: 400, fontSize: '0.75rem' }}>({sm.rowCount.toLocaleString()})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Viewer Table — virtualized */}
            {viewerLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                ⚙️ Loading sheet data…
              </div>
            ) : (
              <div style={{ flex: 1, overflowX: 'auto', border: '1px solid var(--border-color)', background: 'var(--bg-paper-darker)' }}>
                {/* Fixed header */}
                <div style={{ overflowX: 'auto', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-paper-lighter)', borderBottom: '2px solid var(--border-color)' }}>
                  <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: '0.78rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '50px', minWidth: '50px', padding: '0.5rem 0.6rem', textAlign: 'center', fontFamily: 'var(--font-mono)', background: 'var(--bg-paper-lighter)', borderRight: '1px solid var(--border-color)', position: 'sticky', left: 0, zIndex: 5 }}>#</th>
                        {viewerHeaders.map((h, i) => (
                          <th key={i} style={{ minWidth: '130px', maxWidth: '220px', padding: '0.5rem 0.65rem', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--border-color)', background: 'var(--bg-paper-lighter)', fontWeight: 700 }} title={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable body with virtualization */}
                <div
                  ref={viewerContainerRef}
                  style={{ height: `${containerHeight}px`, overflowY: 'auto', overflowX: 'auto' }}
                  onScroll={e => setViewerScrollTop(e.currentTarget.scrollTop)}
                >
                  <div style={{ height: `${totalViewerRows * ROW_HEIGHT}px`, position: 'relative' }}>
                    <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%', fontSize: '0.78rem', position: 'absolute', top: 0, left: 0 }}>
                      <tbody>
                        <tr style={{ height: `${paddingTop}px` }}><td /></tr>
                        {visibleRows.map((row, relIdx) => {
                          const absIdx = visibleStart + relIdx;
                          return (
                            <tr key={absIdx} style={{ height: `${ROW_HEIGHT}px`, borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ width: '50px', minWidth: '50px', textAlign: 'center', padding: '0 0.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', borderRight: '1px solid var(--border-color)', background: 'var(--bg-paper-lighter)', position: 'sticky', left: 0 }}>{absIdx + 1}</td>
                              {viewerHeaders.map((h, colIdx) => (
                                <td key={colIdx} style={{ minWidth: '130px', maxWidth: '220px', padding: '0 0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--border-color)', fontSize: '0.78rem' }} title={row[colIdx] || ''}>
                                  {row[colIdx] || <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        <tr style={{ height: `${paddingBottom}px` }}><td /></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────
// Logs Tab
// ─────────────────────────────────────────
function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (nameFilter = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?name=${encodeURIComponent(nameFilter)}`);
      const data = await res.json();
      if (res.ok) setLogs(data.logs);
      else setLogs([]);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        if (!ignore) {
          if (res.ok) setLogs(data.logs);
          else setLogs([]);
        }
      } catch {
        if (!ignore) setLogs([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '1000px' }}>
      <h2>Activity Log</h2>
      <form onSubmit={(e) => { e.preventDefault(); fetchLogs(filter); }} style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', maxWidth: '400px' }}>
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name..." />
        <button type="submit">Filter</button>
        {filter && <button type="button" className="secondary" onClick={() => { setFilter(''); fetchLogs(''); }}>Clear</button>}
      </form>

      <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
        <table className="manifest-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Name</th>
              <th>Role</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>}
            {!loading && logs.map(log => (
              <tr key={log.id}>
                <td className="mono" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td style={{ fontWeight: 600 }}>{log.name}</td>
                <td>
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: '2px', fontSize: '0.78rem', fontWeight: 700,
                    background: log.role === 'ADMIN' ? 'rgba(178,74,53,0.12)' : 'rgba(61,90,128,0.12)',
                    color: log.role === 'ADMIN' ? 'var(--accent-rust)' : 'var(--accent-blue)'
                  }}>
                    {log.role}
                  </span>
                </td>
                <td>{log.action}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{log.detail}</td>
              </tr>
            ))}
            {!loading && logs.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No log entries found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Settings Tab
// ─────────────────────────────────────────
function SettingsTab() {
  const [workerPassword, setWorkerPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!workerPassword && !adminPassword) { setMsg('Enter at least one password to change.'); setIsError(true); return; }

    try {
      const payload = {};
      if (workerPassword) payload.workerPassword = workerPassword;
      if (adminPassword) payload.adminPassword = adminPassword;

      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setMsg('Passwords updated successfully.');
        setIsError(false);
        setWorkerPassword(''); setAdminPassword('');
      } else {
        setMsg('Failed to update passwords.'); setIsError(true);
      }
    } catch { 
      setMsg('Error saving settings.'); 
      setIsError(true); 
    }
  };

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '550px' }}>
      <h2>Security Settings</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Change the shared Worker password or the Admin password. Leave a field blank to keep it unchanged.
      </p>
      <hr />
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New Worker Password
          </label>
          <input type="password" value={workerPassword} onChange={(e) => setWorkerPassword(e.target.value)} placeholder="Leave blank to keep unchanged" />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>All workers share this single password.</p>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New Admin Password
          </label>
          <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Leave blank to keep unchanged" />
        </div>
        <button type="submit">UPDATE PASSWORDS</button>
        {msg && (
          <div style={{
            padding: '0.75rem', borderRadius: '2px', fontWeight: 600,
            background: isError ? 'rgba(178,74,53,0.1)' : 'rgba(58,122,81,0.1)',
            border: `1px solid ${isError ? 'var(--accent-rust)' : 'var(--accent-green)'}`,
            color: isError ? 'var(--accent-rust)' : 'var(--accent-green)'
          }}>
            {msg}
          </div>
        )}
      </form>

      {/* System Updates & Version Management Section */}
      <SystemUpdatesSection />
    </div>
  );
}

function SystemUpdatesSection() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const res = await fetch('/api/system/update', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateInfo(data);
        if (data.progress && data.progress.step !== 'IDLE' && data.progress.step !== 'COMPLETE' && data.progress.step !== 'ROLLED_BACK') {
          setUploadProgress(data.progress);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.wms')) {
        setSelectedFile(file);
        setErrorMsg('');
      } else {
        setErrorMsg('Please drop a valid .wms update archive.');
      }
    }
  };

  const handleStartUpdate = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setErrorMsg('');
    setUploadProgress({ step: 'UPLOADING', progress: 5, message: 'Streaming update package to server...' });

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wms_auth_token') : null;
      const formData = new FormData();
      formData.append('package', selectedFile);

      const res = await fetch('/api/system/update', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to trigger update');
      }

      // Poll progress actively
      const pollTimer = setInterval(async () => {
        try {
          const sRes = await fetch('/api/system/update', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.progress) {
              setUploadProgress(sData.progress);
              if (sData.progress.step === 'COMPLETE' || sData.progress.step === 'ROLLED_BACK') {
                clearInterval(pollTimer);
                setLoading(false);
                setSelectedFile(null);
                fetchStatus();
              }
            }
          }
        } catch (_) {}
      }, 1500);

    } catch (err) {
      setErrorMsg(err.message);
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const currentVer = updateInfo?.currentVersion || '1.1.0';
  const backups = updateInfo?.backups || [];
  const activeStep = uploadProgress?.step || 'IDLE';

  const stepsList = [
    { key: 'VERIFYING', label: '1. Verify Signature' },
    { key: 'STOPPING', label: '2. Stop Server' },
    { key: 'BACKING_UP', label: '3. DB Backup' },
    { key: 'EXTRACTING', label: '4. Extract' },
    { key: 'SWAPPING', label: '5. Swap Code' },
    { key: 'MIGRATING', label: '6. Migrate DB' },
    { key: 'RELAUNCHING', label: '7. Health Check' },
  ];

  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '2px dashed var(--border-color, #e0e0e0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>System Updates & Maintenance</h2>
        <span style={{
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '0.8rem',
          fontWeight: 700,
          background: 'rgba(37,99,235,0.1)',
          color: 'var(--accent-blue, #2563eb)',
          border: '1px solid rgba(37,99,235,0.3)'
        }}>
          Current: v{currentVer}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Apply lightweight signed patches (.wms). Updates feature cryptographic Ed25519 verification, automatic SQLite WAL checkpoint backups, and atomic rollback protection.
      </p>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--accent-blue, #2563eb)',
          borderRadius: '6px',
          padding: '1.75rem 1rem',
          textAlign: 'center',
          cursor: loading ? 'not-allowed' : 'pointer',
          background: selectedFile ? 'rgba(37,99,235,0.05)' : 'var(--bg-card, #fafafa)',
          transition: 'all 0.2s ease'
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".wms"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setSelectedFile(e.target.files[0]);
              setErrorMsg('');
            }
          }}
        />
        <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📦</div>
        {selectedFile ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-blue, #2563eb)' }}>
              {selectedFile.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready to install
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Drag and drop <span style={{ color: 'var(--accent-blue, #2563eb)' }}>logiflow-update-*.wms</span> here
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              or click to browse local files
            </div>
          </div>
        )}
      </div>

      {selectedFile && !loading && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={handleStartUpdate}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'var(--accent-blue, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            INSTALL UPDATE (ATOMIC & SAFE)
          </button>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            style={{
              padding: '0.75rem 1rem',
              background: 'transparent',
              border: '1px solid var(--border-color, #ccc)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Progress Stepper Display */}
      {uploadProgress && (
        <div style={{
          marginTop: '1.25rem',
          padding: '1rem',
          borderRadius: '6px',
          background: uploadProgress.step === 'COMPLETE' ? 'rgba(58,122,81,0.1)' : 'var(--bg-card, #f4f4f4)',
          border: `1px solid ${uploadProgress.step === 'COMPLETE' ? 'var(--accent-green, #3a7a51)' : 'var(--border-color, #e0e0e0)'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{uploadProgress.step}</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{uploadProgress.progress}%</span>
          </div>

          <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{
              width: `${uploadProgress.progress}%`,
              height: '100%',
              background: uploadProgress.step === 'COMPLETE' ? 'var(--accent-green, #3a7a51)' : 'var(--accent-blue, #2563eb)',
              transition: 'width 0.3s ease'
            }} />
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {uploadProgress.message}
          </div>

          {/* Stepper pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
            {stepsList.map((st) => {
              const isDone = uploadProgress.progress > 85 || st.key === activeStep;
              return (
                <span key={st.key} style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: isDone ? 'rgba(37,99,235,0.15)' : 'rgba(0,0,0,0.05)',
                  color: isDone ? 'var(--accent-blue, #2563eb)' : '#888',
                  fontWeight: isDone ? 700 : 400
                }}>
                  {st.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          borderRadius: '4px',
          background: 'rgba(178,74,53,0.1)',
          border: '1px solid var(--accent-rust, #b24a35)',
          color: 'var(--accent-rust, #b24a35)',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {errorMsg}
        </div>
      )}

      {/* Snapshot / Backup History */}
      <div style={{ marginTop: '1.75rem' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Database Snapshot History</h3>
        {backups.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            No automatic pre-update snapshots generated yet. Snapshots are created automatically before every update.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
            {backups.map((b, idx) => (
              <div key={idx} style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color, #e0e0e0)',
                background: 'var(--bg-card, #fafafa)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem'
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.dirName}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {new Date(b.timestamp).toLocaleString()} • {b.rowCounts?.Order ?? 0} Orders preserved • {((b.fileSizes?.devDb || 0) / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: b.integrityOk ? 'rgba(58,122,81,0.1)' : 'rgba(178,74,53,0.1)',
                  color: b.integrityOk ? 'var(--accent-green, #3a7a51)' : 'var(--accent-rust, #b24a35)',
                  fontWeight: 600
                }}>
                  {b.integrityOk ? '✓ INTEGRITY VERIFIED' : 'CHECK NEEDED'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// NEW: Analytics & KPIs Dashboard Tab
// ─────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/kpis');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load KPIs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/analytics/kpis');
        if (res.ok && !ignore) {
          const json = await res.json();
          setData(json);
        }
      } catch {}
      if (!ignore) setLoading(false);
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Calculating warehouse analytics &amp; cycle times...</div>;
  }

  const sc = data?.statusCounts || {};
  const ta = data?.turnaroundAverages || {};
  const maxHourly = Math.max(...(data?.hourlyThroughput || [1]), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Warehouse Floor KPIs &amp; Productivity</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Real-time fulfillment turnaround metrics, worker leaderboard, and hourly throughput.</p>
        </div>
        <button className="secondary" onClick={fetchKpis} style={{ fontSize: '0.85rem' }}>🔄 Refresh Metrics</button>
      </div>

      {/* Top Level KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ borderLeftColor: 'var(--accent-blue)' }}>
          <div className="kpi-title">Total Floor Volume</div>
          <div className="kpi-val">{sc.TOTAL || 0}</div>
          <div className="kpi-sub">Total orders in manifest</div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: 'var(--accent-green)' }}>
          <div className="kpi-title">Dispatched Today</div>
          <div className="kpi-val" style={{ color: 'var(--accent-green)' }}>{data?.dispatchedTodayCount || 0}</div>
          <div className="kpi-sub">Successfully fulfilled &amp; sent</div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: 'var(--accent-purple)' }}>
          <div className="kpi-title">Avg Picking Duration</div>
          <div className="kpi-val" style={{ color: 'var(--accent-purple)' }}>{ta.avgPickingMin || 0} <span style={{ fontSize: '1rem' }}>min</span></div>
          <div className="kpi-sub">Queue to picked turnaround</div>
        </div>

        <div className="kpi-card" style={{ borderLeftColor: 'var(--accent-amber)' }}>
          <div className="kpi-title">Avg Total Turnaround</div>
          <div className="kpi-val" style={{ color: 'var(--accent-amber)' }}>{ta.avgTotalFulfillmentMin || 0} <span style={{ fontSize: '1rem' }}>min</span></div>
          <div className="kpi-sub">Order entry to outbound dispatch</div>
        </div>
      </div>

      {/* Stage Breakdown & Hourly Velocity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Stage Turnaround Flow */}
        <div className="document-container">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>🔄 Fulfillment Stage Velocity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)' }}>
              <span>1. Queue &amp; Received</span>
              <strong>{sc.RECEIVED || 0} orders waiting</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(109, 89, 122, 0.08)', border: '1px solid var(--accent-purple)' }}>
              <span>2. Picking Stage (Avg {ta.avgPickingMin || 0}m)</span>
              <strong style={{ color: 'var(--accent-purple)' }}>{sc.PICKING || 0} active</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(61, 90, 128, 0.08)', border: '1px solid var(--accent-blue)' }}>
              <span>3. Packing &amp; QC (Avg {ta.avgPackingMin || 0}m)</span>
              <strong style={{ color: 'var(--accent-blue)' }}>{(sc.PACKING || 0) + (sc.QUALITY_CHECK || 0)} active</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'rgba(214, 137, 37, 0.08)', border: '1px solid var(--accent-amber)' }}>
              <span>4. Staged at Dock Bay</span>
              <strong style={{ color: 'var(--accent-amber)' }}>{sc.STAGED || 0} waiting</strong>
            </div>
          </div>
        </div>

        {/* 24-Hour Velocity Histogram */}
        <div className="document-container">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>⚡ Today&apos;s Hourly Fulfillment Velocity</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Distribution of orders picked, packed, and dispatched by hour.</p>
          <div className="bar-chart-container">
            {(data?.hourlyThroughput || []).map((count, hour) => {
              const heightPct = (count / maxHourly) * 100;
              return (
                <div
                  key={hour}
                  className="bar-col"
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                  title={`${hour}:00 - ${count} operations`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>

      {/* Worker Productivity Leaderboard */}
      <div className="document-container">
        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>🏆 Worker Productivity Leaderboard (Today)</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>Rankings based on orders fulfilled, items picked, and dispatches handled today.</p>

        <div className="ledger-table-container">
          <table className="ledger-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Rank</th>
                <th>Worker Name</th>
                <th>Status</th>
                <th>Picked Today</th>
                <th>Packed Today</th>
                <th>Dispatched Today</th>
                <th>Total Operations</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {(data?.leaderboard || []).map((w, idx) => (
                <tr key={w.username}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                  </td>
                  <td style={{ fontWeight: 600 }}>{w.name} ({w.username})</td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      fontSize: '0.75rem', fontWeight: 600,
                      color: w.isActive ? 'var(--accent-green)' : 'var(--text-muted)'
                    }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: w.isActive ? 'var(--accent-green)' : '#999' }} />
                      {w.isActive ? 'Active' : 'Offline'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>{w.pickedToday}</td>
                  <td style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{w.packedToday}</td>
                  <td style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{w.dispatchedToday}</td>
                  <td style={{ fontWeight: 800, fontSize: '1rem' }}>{w.totalActionsToday}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {w.lastActionAt ? new Date(w.lastActionAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
              {(data?.leaderboard || []).length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No worker activity recorded yet today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// NEW: Warehouse Zone & Location Map Tab
// ─────────────────────────────────────────
function ZoneMapTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeZoneModal, setActiveZoneModal] = useState(null);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/zones');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load zone map:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/zones');
        if (res.ok && !ignore) {
          const json = await res.json();
          setData(json);
        }
      } catch {}
      if (!ignore) setLoading(false);
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  if (loading && !data) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading warehouse floor layout...</div>;
  }

  const zones = data?.zones || {};
  const dockBays = data?.dockBays || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Warehouse Storage Zones &amp; Outbound Docks</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Visual layout of aisles, racks, bins, and active staging bays.</p>
        </div>
        <button className="secondary" onClick={fetchZones} style={{ fontSize: '0.85rem' }}>🔄 Refresh Floor Map</button>
      </div>

      {/* Storage Zones */}
      <h3 style={{ fontSize: '1.15rem', marginBottom: '0.75rem' }}>📦 Storage Aisles &amp; Bins (Zones A - D)</h3>
      <div className="zone-grid">
        {Object.entries(zones).map(([zoneKey, z]) => (
          <div key={zoneKey} className="zone-card" onClick={() => setActiveZoneModal(z)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '1.1rem' }}>{z.name}</strong>
              <span className="mono" style={{ fontWeight: 800, fontSize: '1.1rem' }}>{z.count} Orders</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {zoneKey === 'Zone A' && '⚡ Fast-Moving SKU Aisles (Racks R01 - R08)'}
              {zoneKey === 'Zone B' && '📦 Bulk Pallet Racks (Racks R01 - R08)'}
              {zoneKey === 'Zone C' && '🔒 Fragile & High-Value Secure Storage'}
              {zoneKey === 'Zone D' && '🔄 Inbound Staging & Overflow Racks'}
            </div>

            {z.urgentCount > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-rust)', fontWeight: 700, marginBottom: '0.5rem' }}>
                🚨 {z.urgentCount} Urgent / Express Order(s)
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {(z.orders || []).slice(0, 4).map(o => (
                <span key={o.id} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', background: 'var(--bg-paper-darker)', border: '1px solid var(--border-color)', borderRadius: '2px', fontFamily: 'var(--font-mono)' }}>
                  {o.orderNo}
                </span>
              ))}
              {(z.orders || []).length > 4 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{z.orders.length - 4} more</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Outbound Loading Docks */}
      <h3 style={{ fontSize: '1.15rem', margin: '2rem 0 0.75rem' }}>⚓ Outbound Staging Docks (Bays 1 - 6)</h3>
      <div className="dock-grid">
        {Object.entries(dockBays).map(([bayKey, bay]) => {
          const isOccupied = bay.count > 0;
          return (
            <div
              key={bayKey}
              className={`dock-card ${isOccupied ? 'occupied' : ''}`}
              onClick={() => isOccupied && setActiveZoneModal(bay)}
              style={{ cursor: isOccupied ? 'pointer' : 'default' }}
            >
              <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{isOccupied ? '🚚' : '🚪'}</div>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>{bay.name}</strong>
              <div style={{ fontSize: '0.75rem', color: isOccupied ? 'var(--accent-amber)' : 'var(--text-muted)', fontWeight: 600, marginTop: '0.25rem' }}>
                {isOccupied ? `${bay.count} Staged Order(s)` : 'Available'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zone Orders Detail Modal */}
      {activeZoneModal && (
        <div className="modal-overlay" onClick={() => setActiveZoneModal(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <h3>📍 {activeZoneModal.name} — Active Orders ({activeZoneModal.orders?.length || 0})</h3>
            <hr style={{ margin: '0.75rem 0 1rem' }} />

            <div className="ledger-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Transporter</th>
                    <th>Boxes</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeZoneModal.orders || []).map(ord => (
                    <tr key={ord.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ord.orderNo}</td>
                      <td><span className={`status-badge ${ord.status}`}>{ord.status}</span></td>
                      <td><span className={`priority-tag ${ord.priority}`}>{ord.priority}</span></td>
                      <td>{ord.transporter || '—'}</td>
                      <td>{ord.boxCount} Pkg</td>
                    </tr>
                  ))}
                  {(activeZoneModal.orders || []).length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No orders currently in this location.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button type="button" className="secondary" onClick={() => setActiveZoneModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

