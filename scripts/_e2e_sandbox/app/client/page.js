'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '@/app/hooks/useWebSocket';
import BarcodeScanner from '@/app/components/BarcodeScanner';

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Authenticate on mount
  useEffect(() => {
    const rawUser = localStorage.getItem('wms_user');
    const token = localStorage.getItem('wms_auth_token');
    if (!token || !rawUser) {
      router.push('/');
      return;
    }
    try {
      const parsed = JSON.parse(rawUser);
      setUser(parsed);
    } catch (e) {
      router.push('/');
    }
  }, [router]);

  // Fetch initial orders
  const fetchOrders = async () => {
    const token = localStorage.getItem('wms_auth_token');
    if (!token) return;

    try {
      setLoading(true);
      const res = await fetch('/api/orders?limit=300', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Failed to fetch client orders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  // Real-time WebSocket event handler
  const handleWsEvent = (event) => {
    if (event.type === 'STATUS_CHANGE') {
      setOrders(prev => prev.map(o => {
        if (o.orderNo === event.orderNo) {
          return { ...o, status: event.newStatus, updatedAt: new Date().toISOString() };
        }
        return o;
      }));
    } else if (event.type === 'ORDER_UPDATE') {
      fetchOrders();
    } else if (event.type === 'EXCEL_IMPORTED') {
      fetchOrders();
    }
  };

  const { connectionStatus } = useWebSocket(user?.warehouseId || 'default', handleWsEvent);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const s = search.toLowerCase();
      const matchesSearch = !search ||
        (o.orderNo && o.orderNo.toLowerCase().includes(s)) ||
        (o.invoiceNo && o.invoiceNo.toLowerCase().includes(s)) ||
        (o.lrNo && o.lrNo.toLowerCase().includes(s)) ||
        (o.customerName && o.customerName.toLowerCase().includes(s));
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, search]);

  const handleLogout = () => {
    localStorage.removeItem('wms_auth_token');
    localStorage.removeItem('wms_user');
    router.push('/');
  };

  const getStatusBadge = (status) => {
    const map = {
      RECEIVED: { label: 'Received', bg: '#f1f5f9', color: '#475569' },
      PICKING: { label: 'Picking', bg: '#e0f2fe', color: '#0369a1' },
      PACKING: { label: 'Packing', bg: '#fef3c7', color: '#b45309' },
      QUALITY_CHECK: { label: 'QC Passed', bg: '#ede9fe', color: '#6d28d9' },
      STAGED: { label: 'Staged at Dock', bg: '#e0e7ff', color: '#4338ca' },
      DISPATCHED: { label: 'Dispatched', bg: '#dcfce7', color: '#15803d' },
      ON_HOLD: { label: 'On Hold', bg: '#fee2e2', color: '#b91c1c' },
    };
    const s = map[status] || { label: status, bg: '#f1f5f9', color: '#475569' };
    return (
      <span style={{
        backgroundColor: s.bg,
        color: s.color,
        padding: '0.25rem 0.6rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        display: 'inline-block'
      }}>
        {s.label}
      </span>
    );
  };

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-desk, #f8fafc)' }}>
      {/* Glassmorphic Header Bar */}
      <nav className="glass-nav">
        <div className="brand-badge">
          <div className="brand-icon">📦</div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              Client Fulfillment Portal
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Live Order Status &bull; Storefront View ({user.warehouseSlug || 'Main Hub'})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Live Pulse Indicator */}
          <div className="live-pulse-badge">
            <span className="live-pulse-dot" style={{ backgroundColor: connectionStatus === 'CONNECTED' ? '#10b981' : '#f59e0b' }}></span>
            <span>{connectionStatus === 'CONNECTED' ? 'Live Stream Active' : 'Connecting...'}</span>
          </div>

          <button
            type="button"
            className="secondary"
            onClick={() => setScannerOpen(true)}
            style={{ padding: '0.42rem 0.85rem', fontSize: '0.82rem', borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            📸 Scan Barcode
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={handleLogout}
            style={{ padding: '0.42rem 0.85rem', fontSize: '0.82rem', borderRadius: 'var(--radius-pill)' }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ maxWidth: '1240px', margin: '1.75rem auto', padding: '0 1.25rem' }}>
        {/* Search & Filter Toolbar */}
        <div className="card-pro" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.85rem',
          marginBottom: '1.25rem',
          padding: '1rem 1.25rem'
        }}>
          <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search by Order #, Invoice #, or Tracking LR..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.6rem 2.2rem 0.6rem 2.4rem', borderRadius: 'var(--radius-md)' }}
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
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '0.6rem 0.85rem', fontSize: '0.88rem', minWidth: '170px', borderRadius: 'var(--radius-md)' }}
            >
              <option value="ALL">All Stages ({orders.length})</option>
              <option value="RECEIVED">Received</option>
              <option value="PICKING">Picking</option>
              <option value="PACKING">Packing</option>
              <option value="QUALITY_CHECK">QC Passed</option>
              <option value="STAGED">Staged at Dock</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="ON_HOLD">On Hold</option>
            </select>

            {(search || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
                style={{ fontSize: '0.82rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.45rem 0.8rem', borderRadius: 'var(--radius-md)', whiteSpace: 'nowrap' }}
              >
                ✕ Reset Filters
              </button>
            )}

            <button
              type="button"
              className="secondary"
              onClick={fetchOrders}
              style={{ padding: '0.6rem 0.85rem', fontSize: '0.9rem', borderRadius: 'var(--radius-md)' }}
              title="Refresh order records"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Live Tracking Table */}
        <div className="ledger-table-container">
          <div style={{ overflowX: 'auto' }}>
            <table className="manifest-table" style={{ margin: 0, width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Order Number</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Fulfillment Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Carrier / LR #</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Boxes</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted, #64748b)' }}>
                      Loading real-time order records...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted, #64748b)' }}>
                      No orders found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(o => (
                    <tr
                      key={o.id || o.orderNo}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedOrder(o)}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                        {o.orderNo}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {getStatusBadge(o.status)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted, #64748b)' }}>
                        {o.invoiceNo || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {o.transporter ? (
                          <div>
                            <span style={{ fontWeight: 600 }}>{o.transporter}</span>
                            {o.lrNo && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>LR: {o.lrNo}</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {o.boxCount || 1}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted, #64748b)', fontSize: '0.8rem' }}>
                        {o.updatedAt ? new Date(o.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedOrder(null)}
          style={{ zIndex: 9000 }}
        >
          <div
            className="modal-dialog"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '560px', width: '100%', padding: '1.5rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Order Details — {selectedOrder.orderNo}</h3>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedOrder(null)}
                style={{ padding: '0.25rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span>{getStatusBadge(selectedOrder.status)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Invoice Number</span>
                <span style={{ fontWeight: 600 }}>{selectedOrder.invoiceNo || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Carrier / Transporter</span>
                <span style={{ fontWeight: 600 }}>{selectedOrder.transporter || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>LR / Docket / AWB</span>
                <span style={{ fontWeight: 600 }}>{selectedOrder.lrNo || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Item Count / Boxes</span>
                <span style={{ fontWeight: 600 }}>{selectedOrder.boxCount || 1}</span>
              </div>
              {selectedOrder.notes && (
                <div style={{ padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '3px' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Special Instructions / Remarks</div>
                  <div>{selectedOrder.notes}</div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedOrder(null)}
                style={{ padding: '0.45rem 1rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
