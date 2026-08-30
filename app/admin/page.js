'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as xlsx from 'xlsx';
import { printThermalLabel, printDeliveryChallan } from '@/lib/thermalLabel';

const STATUS_COLUMNS = [
  { key: 'RECEIVED', label: 'Received / Queued', color: '#5a5a5a' },
  { key: 'PICKING', label: 'In Picking', color: 'var(--accent-purple)' },
  { key: 'PACKING', label: 'In Packing', color: 'var(--accent-blue)' },
  { key: 'QUALITY_CHECK', label: 'QC Inspection', color: 'var(--accent-teal)' },
  { key: 'STAGED', label: 'Staged at Dock', color: 'var(--accent-amber)' },
  { key: 'DISPATCHED', label: 'Dispatched', color: 'var(--accent-green)' },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState('orders');
  const [currentUser, setCurrentUser] = useState(null);
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
    <div>
      {/* Navigation */}
      <nav>
        <div className="logo">
          <span>📦</span>
          <span>Warehouse Management</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
            {[
              { key: 'orders', label: 'Operations & Kanban' },
              { key: 'analytics', label: 'Analytics & KPIs 📊' },
              { key: 'zonemap', label: 'Warehouse Zone Map 🗺️' },
              { key: 'workers', label: 'Workers & Permissions' },
              { key: 'activity', label: 'Live Worker Activity 🟢' },
              { key: 'upload', label: 'Upload Excel' },
              { key: 'logs', label: 'Activity Log' },
              { key: 'settings', label: 'Security Settings' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '0.5rem 0.9rem',
                  background: tab === t.key ? 'var(--text-main)' : 'transparent',
                  color: tab === t.key ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 0,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            className="secondary"
            onClick={handleExport}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            title="Download full Excel manifest backup"
          >
            <span>📥</span> Export Excel
          </button>

          <a
            href="/api/download"
            download="Warehouse_Management_Setup.exe"
            className="secondary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-main)' }}
            title="Download standalone Windows desktop installer (Zero dependencies - runs without Node.js)"
          >
            <span>💻</span> Desktop App (.exe)
          </a>

          <span style={{ fontSize: '0.8rem', color: 'var(--accent-rust)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {currentUser?.name ? currentUser.name.toUpperCase() : 'ADMIN'}
          </span>

          <button className="secondary" onClick={handleLogout} style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ padding: '1.5rem 2rem' }}>
        {tab === 'orders' && <OperationsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'zonemap' && <ZoneMapTab />}
        {tab === 'workers' && <WorkersTab />}
        {tab === 'activity' && <LiveActivityTab />}
        {tab === 'upload' && <UploadTab onViewOrders={() => setTab('orders')} />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
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
      params.set('limit', '300');

      const [resOrders, resAnalytics] = await Promise.all([
        fetch(`/api/orders?${params.toString()}`),
        fetch('/api/analytics')
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
        params.set('limit', '300');

        const [resOrders, resAnalytics] = await Promise.all([
          fetch(`/api/orders?${params.toString()}`),
          fetch('/api/analytics')
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
  }, [statusFilter, priorityFilter, search]);

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
        <span className={`status-badge ${ord.status}`}>
          {ord.status.replace('_', ' ')}
        </span>
      );
    }
    if (colId === 'priority') {
      return (
        <span className={`priority-tag ${ord.priority}`}>
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
        <div className="grid-4" style={{ marginBottom: '1.75rem' }}>
          <div className="stat-card">
            <div className="stat-label">Total Warehouse Inventory</div>
            <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-meta">Active &amp; Dispatched Orders</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-purple)' }}>
            <div className="stat-label">In Picking / Packing</div>
            <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
              {(stats.statusCounts?.PICKING || 0) + (stats.statusCounts?.PACKING || 0)}
            </div>
            <div className="stat-meta">Being assembled on floor</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
            <div className="stat-label">Staged at Outbound Dock</div>
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>
              {stats.statusCounts?.STAGED || 0}
            </div>
            <div className="stat-meta">Awaiting Carrier Pickup</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
            <div className="stat-label">Dispatched Today</div>
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
              {stats.dispatchedToday || 0}
            </div>
            <div className="stat-meta">Freight on the road</div>
          </div>
        </div>
      )}

      {/* Operational Controls & Filter Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem',
        padding: '1rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)',
        position: 'relative'
      }}>
        {/* Universal Search & Stage Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
          <input
            type="text"
            placeholder="🔍 Search Order No, Customer, City, Product, Invoice, LR, Truck..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '420px', fontSize: '0.88rem' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '150px' }}
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
            style={{ width: 'auto', minWidth: '130px' }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="EXPRESS">Express</option>
            <option value="STANDARD">Standard</option>
          </select>
        </div>

        {/* View Modes & Column Customizer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* View Switcher */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                background: viewMode === 'table' ? 'var(--text-main)' : 'transparent',
                color: viewMode === 'table' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0,
                fontWeight: viewMode === 'table' ? 700 : 500
              }}
              title="Standard operations table with dynamic column selection"
            >
              📋 Operations Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                background: viewMode === 'kanban' ? 'var(--text-main)' : 'transparent',
                color: viewMode === 'kanban' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0,
                fontWeight: viewMode === 'kanban' ? 700 : 500
              }}
              title="Fulfillment stages drag-and-drop kanban board"
            >
              📊 Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('sheet')}
              style={{
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                background: viewMode === 'sheet' ? 'var(--text-main)' : 'transparent',
                color: viewMode === 'sheet' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0,
                fontWeight: viewMode === 'sheet' ? 700 : 500
              }}
              title="Wide spreadsheet grid showing 100% of uploaded Excel columns"
            >
              📑 Full Excel Sheet
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
        <div style={{ overflowX: 'auto', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', borderRadius: '2px' }}>
          <table className="manifest-table" style={{ margin: 0, minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.length === orders.length}
                    onChange={toggleSelectAll}
                    style={{ width: 'auto' }}
                  />
                </th>
                {visibleCols.map(colId => (
                  <th key={colId} style={{ whiteSpace: 'nowrap' }}>
                    {getColLabel(colId)}
                  </th>
                ))}
                <th style={{ textAlign: 'center', width: '130px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    Loading warehouse records...
                  </td>
                </tr>
              )}
              {!loading && orders.map((ord) => (
                <tr key={ord.id} style={{ background: selectedIds.includes(ord.id) ? 'rgba(61,90,128,0.06)' : undefined }}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ord.id)}
                      onChange={() => toggleSelectOrder(ord.id)}
                      style={{ width: 'auto' }}
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
                      className="btn-accent"
                      onClick={() => handleOpenDetails(ord)}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', marginRight: '0.35rem' }}
                      title="Inspect all imported Excel columns & specifications"
                    >
                      👁️ Details
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleOpenEdit(ord)}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      title="Edit fulfillment status"
                    >
                      ✎ Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 2} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    No warehouse records match your filter criteria.
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
    </div>
  );
}

// ─────────────────────────────────────────
// Workers & Permissions Tab
// ─────────────────────────────────────────
function WorkersTab() {
  const [workers, setWorkers] = useState([]);
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
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) setWorkers(data.workers || []);
      else setWorkers([]);
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
        const res = await fetch('/api/users');
        const data = await res.json();
        if (!ignore && res.ok) setWorkers(data.workers || []);
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

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Worker Roster &amp; Access Controls</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage worker accounts under your supervision and customize granular operation permissions.
          </p>
        </div>
        <button type="button" className="btn-accent" onClick={openCreateModal}>
          ➕ Add New Worker
        </button>
      </div>
      <hr />

      <div style={{ overflowX: 'auto' }}>
        <table className="manifest-table">
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
                    padding: '0.2rem 0.5rem', borderRadius: '2px', fontSize: '0.75rem', fontWeight: 700,
                    background: w.isActive ? 'rgba(58,122,81,0.12)' : 'rgba(178,74,53,0.12)',
                    color: w.isActive ? 'var(--accent-green)' : 'var(--accent-rust)'
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
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', color: 'var(--accent-rust)' }}
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
// Upload Tab (Interactive Preview & Mapping)
// ─────────────────────────────────────────
function UploadTab({ onViewOrders }) {
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [customMapping, setCustomMapping] = useState({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const parseFileLocally = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setResult(null);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = xlsx.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      const defaultSheet = wb.SheetNames[0] || '';
      setSelectedSheet(defaultSheet);
      processSheetData(wb, defaultSheet);
    } catch (err) {
      console.error('Local parse error:', err);
    }
  };

  const processSheetData = (wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const rows2D = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows2D.length === 0) return;

    let bestIdx = 0;
    let maxCols = 0;
    for (let i = 0; i < Math.min(rows2D.length, 10); i++) {
      const r = rows2D[i];
      if (!Array.isArray(r)) continue;
      const count = r.filter(c => c !== null && c !== undefined && String(c).trim().length > 0).length;
      if (count > maxCols) {
        maxCols = count;
        bestIdx = i;
      }
    }

    const headers = (rows2D[bestIdx] || []).map(h => String(h || '').trim()).filter(Boolean);
    const dataOnly = rows2D.slice(bestIdx + 1).filter(r => r && r.some(c => c !== '' && c !== null && c !== undefined));
    setPreviewHeaders(headers);
    setPreviewRows(dataOnly.slice(0, 5));
    setTotalRows(dataOnly.length);

    // Smart auto-mapping suggestions
    const initialMapping = {};
    headers.forEach(h => {
      const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['orderno', 'orderid', 'order', 'pono', 'refno', 'referenceno', 'bookingno', 'consignmentno', 'docketno', 'awb', 'id', 'srno'].includes(norm)) {
        if (!Object.values(initialMapping).includes('orderNo')) initialMapping[h] = 'orderNo';
      } else if (['customer', 'customername', 'party', 'partyname', 'consignee', 'buyer', 'client'].includes(norm)) {
        if (!Object.values(initialMapping).includes('customer')) initialMapping[h] = 'customer';
      } else if (['destination', 'city', 'deliverycity', 'location', 'address', 'state'].includes(norm)) {
        if (!Object.values(initialMapping).includes('destination')) initialMapping[h] = 'destination';
      } else if (['item', 'items', 'product', 'sku', 'description', 'material'].includes(norm)) {
        if (!Object.values(initialMapping).includes('skuList')) initialMapping[h] = 'skuList';
      } else if (['transporter', 'carrier', 'courier', 'transport', 'logistics'].includes(norm)) {
        if (!Object.values(initialMapping).includes('transporter')) initialMapping[h] = 'transporter';
      } else if (['status', 'stage', 'fulfillment', 'shipmentstatus'].includes(norm)) {
        if (!Object.values(initialMapping).includes('status')) initialMapping[h] = 'status';
      } else if (['qty', 'quantity', 'boxes', 'cartons', 'boxcount', 'pieces', 'units'].includes(norm)) {
        if (!Object.values(initialMapping).includes('boxCount')) initialMapping[h] = 'boxCount';
      } else if (['invoice', 'invoiceno', 'billno', 'challan'].includes(norm)) {
        if (!Object.values(initialMapping).includes('invoiceNo')) initialMapping[h] = 'invoiceNo';
      } else if (['lr', 'lrno', 'docket', 'awb', 'trackingno', 'tracking'].includes(norm)) {
        if (!Object.values(initialMapping).includes('lrNo')) initialMapping[h] = 'lrNo';
      }
    });
    setCustomMapping(initialMapping);
  };

  const handleSheetChange = (newSheet) => {
    setSelectedSheet(newSheet);
    if (workbook) {
      processSheetData(workbook, newSheet);
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
      if (!targetField) {
        delete updated[header];
      } else {
        // Clear previous assignment to this target field
        Object.keys(updated).forEach(k => {
          if (updated[k] === targetField) delete updated[k];
        });
        updated[header] = targetField;
      }
      return updated;
    });
  };

  const doUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', selectedSheet);
    formData.append('mapping', JSON.stringify(customMapping));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult({
          ok: true,
          added: data.added,
          updated: data.updated,
          fallbackAssigned: data.fallbackAssigned || 0,
          totalProcessed: data.totalProcessed || (data.added + data.updated),
          headers: data.headersDetected || previewHeaders,
          msg: `Successfully imported ${data.totalProcessed || (data.added + data.updated)} orders (${data.added} added, ${data.updated} updated). All Excel columns retained!`
        });
      } else {
        setResult({ ok: false, msg: `Error: ${data.error}` });
      }
    } catch {
      setResult({ ok: false, msg: 'Upload failed. Please check your network connection and try again.' });
    }
    setUploading(false);
  };

  return (
    <div style={{ margin: '0 auto', maxWidth: '960px' }}>
      {/* Title & Description */}
      <div style={{ marginBottom: '1.5rem', background: 'var(--bg-paper-lighter)', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
        <h2 style={{ margin: '0 0 0.5rem 0' }}>📦 Full-Data Excel Import Engine</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
          Upload any warehouse shipment sheet (.xlsx / .xls). All custom business columns (Customer Name, Destination City, Items, Qty, Amount, etc.) are <strong>100% captured and retained</strong> with zero skipped rows.
        </p>
      </div>

      {/* Drag & Drop File Zone */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            padding: '3.5rem 2rem',
            border: `2px dashed ${dragOver ? 'var(--accent-blue)' : 'var(--border-dark)'}`,
            background: dragOver ? 'rgba(61,90,128,0.06)' : 'var(--bg-paper-lighter)',
            textAlign: 'center',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            borderRadius: '2px'
          }}
          onClick={() => document.getElementById('excel-file-input').click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📊</div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Drop your Excel file here or click to browse</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Supports .xlsx and .xls workbooks with any sheet structure</p>
          <input
            id="excel-file-input"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files[0]) parseFileLocally(e.target.files[0]); }}
          />
        </div>
      )}

      {/* File Loaded & Interactive Preview */}
      {file && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* File & Sheet Overview Bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.25rem',
            background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>📄 {file.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {(file.size / 1024).toFixed(1)} KB · <strong>{totalRows}</strong> Data Rows · <strong>{previewHeaders.length}</strong> Columns Detected
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {sheetNames.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Sheet:</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem', width: 'auto' }}
                  >
                    {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <button
                className="secondary"
                onClick={() => { setFile(null); setWorkbook(null); setResult(null); }}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem' }}
              >
                Change File
              </button>
            </div>
          </div>

          {/* Interactive Column Mapping Overview */}
          <div style={{ padding: '1.25rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                ⚡ Auto-Detected Field Mappings
              </h4>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                All unmapped columns will be preserved in full as custom Excel attributes
              </span>
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
                      {previewHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spreadsheet Live Preview Table (First 5 Rows) */}
          <div style={{ background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Live Sheet Preview (First {previewRows.length} of {totalRows} Rows)</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sheet: {selectedSheet}</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '240px' }}>
              <table className="manifest-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                    {previewHeaders.map((h) => (
                      <th key={h} style={{ whiteSpace: 'nowrap' }}>
                        {h}
                        {customMapping[h] && (
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--accent-blue)', fontWeight: 'normal' }}>
                            → {customMapping[h]}
                          </span>
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
                        <td key={colIdx} style={{ whiteSpace: 'nowrap' }}>
                          {row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import Action & Feedback */}
          {!uploading && !result && (
            <button
              onClick={doUpload}
              style={{
                padding: '0.85rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 700,
                background: 'var(--text-main)',
                color: 'var(--bg-paper-lighter)',
                cursor: 'pointer'
              }}
            >
              📥 IMPORT {totalRows} ORDERS INTO WAREHOUSE REGISTER
            </button>
          )}

          {uploading && (
            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', fontWeight: 600 }}>
              ⏳ Ingesting and validating {totalRows} records, please wait...
            </div>
          )}

          {result && (
            <div style={{
              padding: '1.25rem',
              background: result.ok ? 'rgba(58,122,81,0.08)' : 'rgba(178,74,53,0.08)',
              border: `1px solid ${result.ok ? 'var(--accent-green)' : 'var(--accent-rust)'}`,
              borderRadius: '2px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem', color: result.ok ? 'var(--accent-green)' : 'var(--accent-rust)' }}>
                <span>{result.ok ? '✅' : '❌'}</span>
                <span>{result.msg}</span>
              </div>

              {result.ok && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  <div>• <strong>{result.added}</strong> new warehouse orders registered.</div>
                  <div>• <strong>{result.updated}</strong> existing orders merged and updated.</div>
                  <div>• <strong>0</strong> rows dropped or lost.</div>
                  <div>• All <strong>{result.headers?.length || previewHeaders.length}</strong> columns available in Operations Table.</div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    {onViewOrders && (
                      <button
                        onClick={onViewOrders}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        🚀 View Orders in Operations Table
                      </button>
                    )}
                    <button
                      className="secondary"
                      onClick={() => { setFile(null); setWorkbook(null); setResult(null); }}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    >
                      Import Another Sheet
                    </button>
                  </div>
                </div>
              )}

              {!result.ok && (
                <button
                  className="secondary"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => setResult(null)}
                >
                  Try Again
                </button>
              )}
            </div>
          )}
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

      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

