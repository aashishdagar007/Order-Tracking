'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();

  // Auth check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth');
        const data = await res.json();
        if (!data.user || data.user.role !== 'ADMIN') {
          router.push('/');
        }
      } catch {
        router.push('/');
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', { method: 'GET' });
      const data = await res.json();
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout', name: data.user?.name, role: data.user?.role })
      });
    } catch {}
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
          <span>🏭</span>
          <span>Warehouse Master Control</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0' }}>
            {[
              { key: 'orders', label: 'Operations & Kanban' },
              { key: 'upload', label: 'Upload Excel' },
              { key: 'logs', label: 'Activity Log' },
              { key: 'settings', label: 'Security Settings' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '0.5rem 1rem',
                  background: tab === t.key ? 'var(--text-main)' : 'transparent',
                  color: tab === t.key ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 0,
                  fontSize: '0.85rem',
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
            style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
            title="Download full Excel manifest backup"
          >
            <span>📥</span> Export Excel
          </button>

          <span style={{ fontSize: '0.8rem', color: 'var(--accent-rust)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            ADMIN
          </span>

          <button className="secondary" onClick={handleLogout} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ padding: '1.5rem 2rem' }}>
        {tab === 'orders' && <OperationsTab onExport={handleExport} />}
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
      {/* ───────────────────────────────────────── */}
      {/* Top Live Warehouse KPI Stat Cards */}
      {/* ───────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────── */}
      {/* Operational Controls & Filter Bar */}
      {/* ───────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────── */}
      {/* KANBAN BOARD VIEW */}
      {/* ───────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────── */}
      {/* TABLE MANIFEST GRID VIEW */}
      {/* ───────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────── */}
      {/* Edit Order Modal */}
      {/* ───────────────────────────────────────── */}
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

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" style={{ flex: 1 }}>SAVE CHANGES</button>
                <button type="button" className="secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────── */}
      {/* Batch / Bulk Operations Modal */}
      {/* ───────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────── */}
      {/* Printable Gate Pass Modal */}
      {/* ───────────────────────────────────────── */}
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
