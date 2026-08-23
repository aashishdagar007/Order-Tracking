'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
        {tab === 'upload' && <UploadTab />}
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
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
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
  const [gatePassOpen, setGatePassOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState('DISPATCHED');
  const [bulkTransporter, setBulkTransporter] = useState('');
  const [bulkVehicle, setBulkVehicle] = useState('');
  const [bulkDock, setBulkDock] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState({});

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '250');

      const [resOrders, resAnalytics] = await Promise.all([
        fetch(`/api/orders?${params.toString()}`),
        fetch('/api/analytics')
      ]);

      const dataOrders = await resOrders.json();
      const dataAnalytics = await resAnalytics.json();

      if (resOrders.ok) setOrders(dataOrders.orders || []);
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
        params.set('limit', '250');

        const [resOrders, resAnalytics] = await Promise.all([
          fetch(`/api/orders?${params.toString()}`),
          fetch('/api/analytics')
        ]);

        const dataOrders = await resOrders.json();
        const dataAnalytics = await resAnalytics.json();

        if (!ignore) {
          if (resOrders.ok) setOrders(dataOrders.orders || []);
          if (resAnalytics.ok) setStats(dataAnalytics);
        }
      } catch {
        if (!ignore) setOrders([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [statusFilter, priorityFilter, search]);

  const handleOpenEdit = (order) => {
    setSelectedOrder(order);
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
        padding: '1rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)'
      }}>
        {/* Search & Filter */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '300px' }}>
          <input
            type="text"
            placeholder="Search Order No, Invoice, LR, Zone, Carrier, Truck..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '380px' }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '150px' }}
          >
            <option value="ALL">All Stages</option>
            <option value="RECEIVED">Received</option>
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

        {/* View Switcher & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.85rem',
                background: viewMode === 'kanban' ? 'var(--text-main)' : 'transparent',
                color: viewMode === 'kanban' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0
              }}
            >
              📊 Kanban Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.45rem 0.9rem',
                fontSize: '0.85rem',
                background: viewMode === 'table' ? 'var(--text-main)' : 'transparent',
                color: viewMode === 'table' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0
              }}
            >
              📋 Manifest Grid
            </button>
          </div>

          {selectedIds.length > 0 && (
            <button
              type="button"
              className="btn-accent"
              onClick={() => setBulkModalOpen(true)}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
            >
              ⚡ Batch Action ({selectedIds.length})
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
                  {colOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="kanban-card"
                      onClick={() => handleOpenEdit(ord)}
                    >
                      <div className="kanban-card-header">
                        <span className="kanban-card-title">{ord.orderNo}</span>
                        <span className={`priority-tag ${ord.priority}`}>
                          {ord.priority}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                        📍 {ord.zone || 'Zone not set'}
                      </div>

                      {ord.dockBay && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', marginBottom: '0.4rem', fontWeight: 600 }}>
                          ⚓ {ord.dockBay}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', borderTop: '1px dotted var(--border-color)', paddingTop: '0.4rem' }}>
                        <span>{ord.boxCount} Pkg · {ord.weightKg ? `${ord.weightKg}kg` : '—'}</span>
                        <span className="mono">{ord.transporter ? ord.transporter : 'Unassigned'}</span>
                      </div>
                    </div>
                  ))}

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

      {/* Table Manifest Grid View */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-color)', borderRadius: '2px' }}>
          <table className="manifest-table" style={{ margin: 0 }}>
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
                <th>Order No</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Location / Zone</th>
                <th>Dock / Bay</th>
                <th>Transporter</th>
                <th>Vehicle Plate</th>
                <th>Boxes</th>
                <th>Weight</th>
                <th>Invoice</th>
                <th>LR No</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
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
                  <td style={{ fontWeight: 700 }}>
                    <span className="mono">{ord.orderNo}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${ord.status}`}>
                      {ord.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-tag ${ord.priority}`}>
                      {ord.priority}
                    </span>
                  </td>
                  <td>{ord.zone || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{ord.dockBay || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{ord.transporter || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td className="mono">{ord.vehicleNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{ord.boxCount}</td>
                  <td>{ord.weightKg ? `${ord.weightKg} kg` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{ord.invoiceNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{ord.lrNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleOpenEdit(ord)}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                    >
                      ✎ Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No warehouse records match your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Order Modal */}
      {editModalOpen && selectedOrder && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Order Master Editor: <span className="mono">{selectedOrder.orderNo}</span></h3>
              <button className="secondary" onClick={() => setEditModalOpen(false)} style={{ padding: '0.2rem 0.5rem' }}>✕</button>
            </div>
            <hr />

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
// Upload Tab
// ─────────────────────────────────────────
function UploadTab() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const doUpload = async (selectedFile) => {
    if (!selectedFile) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', selectedFile);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: `Upload complete: ${data.added} orders added, ${data.updated} orders updated, ${data.skipped || 0} rows skipped.` });
      } else {
        setResult({ ok: false, msg: `Error: ${data.error}` });
      }
    } catch {
      setResult({ ok: false, msg: 'Upload failed. Please try again.' });
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); doUpload(dropped); }
  };

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '700px' }}>
      <h2>Upload Shipment Excel</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Upload your warehouse Excel sheet. Column headers (e.g. <span className="mono">Order No</span>, <span className="mono">Zone</span>, <span className="mono">Priority</span>, <span className="mono">Transporter</span>, <span className="mono">Invoice No</span>, <span className="mono">Status</span>) are automatically detected and parsed.
      </p>
      <hr />

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          marginTop: '1.5rem',
          padding: '3rem 2rem',
          border: `2px dashed ${dragOver ? 'var(--accent-blue)' : 'var(--border-dark)'}`,
          background: dragOver ? 'rgba(61,90,128,0.05)' : 'transparent',
          textAlign: 'center',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById('excel-file-input').click()}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
          {file ? file.name : 'Drop your Excel file here or click to browse'}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Supports .xlsx and .xls</p>
        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); } }}
        />
      </div>

      {file && !uploading && !result && (
        <button
          onClick={() => doUpload(file)}
          style={{ marginTop: '1rem', width: '100%', fontSize: '1rem' }}
        >
          UPLOAD &amp; IMPORT {file.name}
        </button>
      )}

      {uploading && (
        <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', fontWeight: 600, background: 'var(--bg-paper-darker)' }}>
          Processing Excel file, please wait...
        </div>
      )}

      {result && (
        <div style={{
          marginTop: '1rem', padding: '1rem',
          background: result.ok ? 'rgba(58,122,81,0.1)' : 'rgba(178,74,53,0.1)',
          border: `1px solid ${result.ok ? 'var(--accent-green)' : 'var(--accent-rust)'}`,
          borderRadius: '2px', fontWeight: 600,
          color: result.ok ? 'var(--accent-green)' : 'var(--accent-rust)'
        }}>
          {result.msg}
        </div>
      )}

      {result && (
        <button className="secondary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => { setFile(null); setResult(null); }}>
          Upload Another File
        </button>
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

