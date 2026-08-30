'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { playSuccessBeep, playWarningBeep, playErrorBuzzer, playDispatchChime } from '@/lib/audio';
import { printThermalLabel, printDeliveryChallan } from '@/lib/thermalLabel';
import BarcodeScanner from '@/app/components/BarcodeScanner';

const WORKFLOW_STEPS = [
  { key: 'RECEIVED', label: 'Received' },
  { key: 'PICKING', label: 'Picking' },
  { key: 'PACKING', label: 'Packing' },
  { key: 'QUALITY_CHECK', label: 'QC Inspection' },
  { key: 'STAGED', label: 'Staged at Dock' },
  { key: 'DISPATCHED', label: 'Dispatched' },
];

export default function WorkerDashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState(null);
  const [isSearched, setIsSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Audio & Wave Picking Mode state
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [workerMode, setWorkerMode] = useState('single'); // 'single' | 'wave'
  const [waveZone, setWaveZone] = useState('Zone A');
  const [waveOrders, setWaveOrders] = useState([]);
  const [waveSelectedIds, setWaveSelectedIds] = useState([]);
  const [waveLoading, setWaveLoading] = useState(false);

  // New Order Form state (if NOT ON FILE)
  const [newForm, setNewForm] = useState({
    invoiceNo: '',
    lrNo: '',
    status: 'RECEIVED',
    priority: 'STANDARD',
    zone: '',
    dockBay: '',
    transporter: '',
    vehicleNo: '',
    boxCount: '1',
    weightKg: '',
    notes: '',
  });

  // Step Action Dialog state
  const [stepModal, setStepModal] = useState({
    open: false,
    targetStatus: '',
    notes: '',
    dockBay: '',
    transporter: '',
    vehicleNo: '',
    boxCount: '1',
    weightKg: '',
    lrNo: '',
    invoiceNo: ''
  });

  const router = useRouter();
  const searchInputRef = useRef(null);
  const videoRef = useRef(null);

  // Auth check & heartbeat on mount
  useEffect(() => {
    let ignore = false;
    async function checkAuth() {
      try {
        const token = localStorage.getItem('wms_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/auth', { headers });
        const data = await res.json();
        if (!ignore) {
          if (!data.user) {
            router.push('/');
          } else {
            setCurrentUser(data.user);
          }
        }
      } catch {
        if (!ignore) router.push('/');
      }
    }
    checkAuth();

    // Send heartbeat ping every 45 seconds to keep live activity updated
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('wms_auth_token');
        await fetch('/api/auth', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ actionText: 'Active on fulfillment terminal' }),
        });
      } catch {}
    }, 45000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
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

  const executeSearch = useCallback(async (query) => {
    const term = (query || search).trim();
    if (!term) return;
    setLoading(true);
    setIsSearched(false);
    setOrder(null);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/orders?orderNo=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder(data.order);
        if (soundEnabled) {
          if (data.order.priority === 'URGENT' || data.order.priority === 'EXPRESS') {
            playWarningBeep();
          } else {
            playSuccessBeep();
          }
        }
      } else {
        if (soundEnabled) playErrorBuzzer();
        setNewForm({
          invoiceNo: '',
          lrNo: '',
          status: 'RECEIVED',
          priority: 'STANDARD',
          zone: '',
          dockBay: '',
          transporter: '',
          vehicleNo: '',
          boxCount: '1',
          weightKg: '',
          notes: '',
        });
      }
      setIsSearched(true);
    } catch {
      if (soundEnabled) playErrorBuzzer();
      setSaveMsg('Error loading order data. Please try again.');
    }
    setLoading(false);
  }, [search, soundEnabled]);

  const fetchWaveOrders = useCallback(async (zone) => {
    setWaveLoading(true);
    try {
      const z = zone !== undefined ? zone : waveZone;
      const res = await fetch('/api/orders?limit=100');
      const data = await res.json();
      if (res.ok && data.orders) {
        const activePending = data.orders.filter(o => o.status !== 'DISPATCHED');
        const filtered = z === 'ALL'
          ? activePending
          : activePending.filter(o => o.zone && o.zone.toLowerCase().includes(z.toLowerCase()));
        setWaveOrders(filtered);
        setWaveSelectedIds([]);
      }
    } catch {
      setWaveOrders([]);
    } finally {
      setWaveLoading(false);
    }
  }, [waveZone]);

  useEffect(() => {
    let ignore = false;
    if (workerMode === 'wave') {
      fetch('/api/orders?limit=100')
        .then(r => r.json())
        .then(data => {
          if (!ignore && data?.orders) {
            const activePending = data.orders.filter(o => o.status !== 'DISPATCHED');
            const filtered = waveZone === 'ALL'
              ? activePending
              : activePending.filter(o => o.zone && o.zone.toLowerCase().includes(waveZone.toLowerCase()));
            setWaveOrders(filtered);
            setWaveSelectedIds([]);
          }
        })
        .catch(() => {});
    }
    return () => { ignore = true; };
  }, [workerMode, waveZone]);

  const handleWaveBatchAdvance = async (targetStatus) => {
    if (waveSelectedIds.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/orders/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: waveSelectedIds,
          status: targetStatus,
          note: `Wave batch advanced to ${targetStatus}`
        })
      });
      if (res.ok) {
        if (soundEnabled) {
          if (targetStatus === 'DISPATCHED') playDispatchChime();
          else playSuccessBeep();
        }
        setSaveMsg(`✓ Successfully advanced ${waveSelectedIds.length} orders to ${targetStatus}`);
        fetchWaveOrders(waveZone);
      } else {
        if (soundEnabled) playErrorBuzzer();
        setSaveMsg('Failed to process batch wave');
      }
    } catch {
      if (soundEnabled) playErrorBuzzer();
      setSaveMsg('Network error on batch wave');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    executeSearch();
  };

  const handleAdvanceStatus = (targetStatus) => {
    setStepModal({
      open: true,
      targetStatus,
      notes: '',
      dockBay: order.dockBay || '',
      transporter: order.transporter || '',
      vehicleNo: order.vehicleNo || '',
      boxCount: String(order.boxCount || '1'),
      weightKg: order.weightKg ? String(order.weightKg) : '',
      lrNo: order.lrNo || '',
      invoiceNo: order.invoiceNo || ''
    });
  };

  const submitStepTransition = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        id: order.id,
        status: stepModal.targetStatus,
        dockBay: stepModal.dockBay || undefined,
        transporter: stepModal.transporter || undefined,
        vehicleNo: stepModal.vehicleNo || undefined,
        boxCount: stepModal.boxCount ? parseInt(stepModal.boxCount, 10) : undefined,
        weightKg: stepModal.weightKg ? parseFloat(stepModal.weightKg) : undefined,
        lrNo: stepModal.lrNo || undefined,
        invoiceNo: stepModal.invoiceNo || undefined,
        eventNote: stepModal.notes || `Advanced to ${stepModal.targetStatus}`
      };

      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder(data.order);
        setStepModal({ ...stepModal, open: false });
        setSaveMsg(`✓ Order updated to ${data.order.status}`);
      } else {
        setSaveMsg(data.error || 'Failed to update order');
      }
    } catch {
      setSaveMsg('Error updating order stage');
    }
    setActionLoading(false);
  };

  const handleSaveNew = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNo: search.trim(),
          ...newForm
        })
      });
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        setSaveMsg('Order added to warehouse register.');
      } else {
        setSaveMsg(data.error || 'Failed to save');
      }
    } catch {
      setSaveMsg('Error saving order');
    }
    setLoading(false);
  };

  const getExtraFields = (ord) => {
    if (!ord?.extra) return null;
    try { return JSON.parse(ord.extra); } catch { return null; }
  };

  // Camera Barcode Scanning Simulation & Stream
  useEffect(() => {
    let stream = null;
    if (scannerOpen && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => {
          // Camera access denied or not available
        });
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scannerOpen]);

  const handleSimulateScan = (scannedCode) => {
    setScannerOpen(false);
    setSearch(scannedCode);
    executeSearch(scannedCode);
  };

  const currentStepIndex = WORKFLOW_STEPS.findIndex(s => s.key === order?.status);

  return (
    <div>
      {/* Nav */}
      <nav>
        <div className="logo">
          <span>📦</span>
          <span>Warehouse Management</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            className="sound-badge"
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
          >
            {soundEnabled ? '🔊 Scanner Audio ON' : '🔇 Audio Muted'}
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Operator: <strong>{currentUser?.name || 'Worker'}</strong>
          </span>
          <button className="secondary" onClick={handleLogout} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </nav>

      <div className="document-container">
        {/* Mode Switcher */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setWorkerMode('single')}
              style={{
                padding: '0.5rem 1.1rem',
                fontSize: '0.85rem',
                background: workerMode === 'single' ? 'var(--text-main)' : 'transparent',
                color: workerMode === 'single' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0
              }}
            >
              ⚡ Single Order Scan
            </button>
            <button
              type="button"
              onClick={() => setWorkerMode('wave')}
              style={{
                padding: '0.5rem 1.1rem',
                fontSize: '0.85rem',
                background: workerMode === 'wave' ? 'var(--text-main)' : 'transparent',
                color: workerMode === 'wave' ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                border: 'none',
                borderRadius: 0
              }}
            >
              🌊 Wave Aisle Picking ({waveOrders.length})
            </button>
          </div>

          {workerMode === 'single' && (
            <button
              type="button"
              className="btn-accent"
              onClick={() => setScannerOpen(true)}
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
            >
              <span>📷</span> SCAN BARCODE / QR
            </button>
          )}
        </div>

        {/* ───────────────────────────────────────── */}
        {/* MODE 1: SINGLE SCAN FULFILLMENT           */}
        {/* ───────────────────────────────────────── */}
        {workerMode === 'single' && (
          <>
            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan / Type Order ID, Customer, City, Invoice, LR No..."
                style={{ fontSize: '1.15rem', flex: 1, padding: '0.85rem 1rem' }}
                autoFocus
              />
              <button type="submit" disabled={loading} style={{ whiteSpace: 'nowrap', minWidth: '130px', fontSize: '1rem' }}>
                {loading ? 'LOOKUP...' : 'FIND ORDER'}
              </button>
            </form>
          </>
        )}

        {/* ───────────────────────────────────────── */}
        {/* MODE 2: WAVE / BATCH AISLE PICKING        */}
        {/* ───────────────────────────────────────── */}
        {workerMode === 'wave' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Select Aisle / Zone:</label>
                <select
                  value={waveZone}
                  onChange={(e) => {
                    setWaveZone(e.target.value);
                    fetchWaveOrders(e.target.value);
                  }}
                  style={{ width: 'auto', minWidth: '150px' }}
                >
                  <option value="Zone A">Zone A (Fast Moving)</option>
                  <option value="Zone B">Zone B (Bulk Pallets)</option>
                  <option value="Zone C">Zone C (Fragile/Secure)</option>
                  <option value="Zone D">Zone D (Overflow)</option>
                  <option value="ALL">All Zones</option>
                </select>
              </div>

              {waveSelectedIds.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={() => handleWaveBatchAdvance('PICKING')}
                    disabled={actionLoading}
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                  >
                    ▶ Start Picking ({waveSelectedIds.length})
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={() => handleWaveBatchAdvance('PACKING')}
                    disabled={actionLoading}
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                  >
                    📦 Mark Packed ({waveSelectedIds.length})
                  </button>
                  <button
                    type="button"
                    className="btn-green"
                    onClick={() => handleWaveBatchAdvance('STAGED')}
                    disabled={actionLoading}
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                  >
                    ⚓ Stage at Dock ({waveSelectedIds.length})
                  </button>
                </div>
              )}
            </div>

            {/* Wave Checklist Table */}
            <div className="ledger-table-container">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={waveOrders.length > 0 && waveSelectedIds.length === waveOrders.length}
                        onChange={() => {
                          if (waveSelectedIds.length === waveOrders.length) {
                            setWaveSelectedIds([]);
                          } else {
                            setWaveSelectedIds(waveOrders.map(o => o.id));
                          }
                        }}
                        style={{ width: 'auto' }}
                      />
                    </th>
                    <th>Order No</th>
                    <th>Priority</th>
                    <th>Stage</th>
                    <th>Zone / Rack</th>
                    <th>Boxes</th>
                    <th>Transporter</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {waveLoading && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        Loading wave picklist for {waveZone}...
                      </td>
                    </tr>
                  )}
                  {!waveLoading && waveOrders.map((ord) => (
                    <tr key={ord.id} style={{ background: waveSelectedIds.includes(ord.id) ? 'rgba(61,90,128,0.06)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={waveSelectedIds.includes(ord.id)}
                          onChange={() => {
                            if (waveSelectedIds.includes(ord.id)) {
                              setWaveSelectedIds(waveSelectedIds.filter(id => id !== ord.id));
                            } else {
                              setWaveSelectedIds([...waveSelectedIds, ord.id]);
                            }
                          }}
                          style={{ width: 'auto' }}
                        />
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ord.orderNo}</td>
                      <td><span className={`priority-tag ${ord.priority}`}>{ord.priority}</span></td>
                      <td><span className={`status-badge ${ord.status}`}>{ord.status}</span></td>
                      <td>📍 {ord.zone || 'Zone A'}</td>
                      <td>{ord.boxCount} Pkg</td>
                      <td>{ord.transporter || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setWorkerMode('single');
                            setSearch(ord.orderNo);
                            executeSearch(ord.orderNo);
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                        >
                          Open Single View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!waveLoading && waveOrders.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                        No pending orders in {waveZone}. All aisle orders picked &amp; dispatched!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notifications */}
        {saveMsg && (
          <div style={{
            marginTop: '1.25rem', padding: '0.85rem 1rem',
            background: 'rgba(58,122,81,0.1)', border: '1px solid var(--accent-green)',
            borderRadius: '2px', color: 'var(--accent-green)', fontWeight: 600
          }}>
            {saveMsg}
          </div>
        )}

        {/* ───────────────────────────────────────── */}
        {/* FOUND: Order details & Guided Fulfillment */}
        {/* ───────────────────────────────────────── */}
        {workerMode === 'single' && isSearched && order && (
          <div style={{ marginTop: '2.5rem', position: 'relative' }}>
            {/* Status Stamp */}
            <div className={`ink-stamp ${order.status.toLowerCase().replace('_', '-')}`}>
              {order.status.replace('_', ' ')}
            </div>

            {/* Header with Title and Priority */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>
                Order: <span className="mono">{order.orderNo}</span>
              </h3>
              <span className={`priority-tag ${order.priority}`}>
                {order.priority}
              </span>
              <span className={`status-badge ${order.status}`}>
                {order.status.replace('_', ' ')}
              </span>
            </div>

            {/* Prominent Customer & Excel Consignment Details */}
            {(() => {
              const extras = getExtraFields(order) || {};
              const customer = extras.Customer || extras['Customer Name'] || extras['Party Name'] || extras['Party'] || extras['Consignee'] || extras['Buyer'];
              const destination = extras.Destination || extras['Destination City'] || extras['City'] || extras['Delivery City'] || order.zone;
              const items = extras['Item Description'] || extras['Product'] || extras['Item'] || extras['SKU'] || order.skuList;

              if (!customer && !destination && !items) return null;

              return (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem',
                  margin: '0.75rem 0',
                  padding: '0.85rem 1rem',
                  background: 'rgba(61,90,128,0.06)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px'
                }}>
                  {customer && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer / Party</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>🏢 {customer}</div>
                    </div>
                  )}
                  {destination && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination / City</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>🗺️ {destination}</div>
                    </div>
                  )}
                  {items && (
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Item / Description</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={items}>📦 {items}</div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Physical Warehouse Location Banner */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
              margin: '1.25rem 0', padding: '1rem 1.25rem', background: 'var(--bg-paper-darker)',
              borderLeft: '4px solid var(--accent-blue)', borderRadius: '2px'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                  Warehouse Storage Bin / Location
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>📍</span>
                  <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                    {order.zone || 'Unassigned Zone (Awaiting Slotting)'}
                  </span>
                </div>
              </div>

              {order.dockBay && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                    Outbound Staging Bay
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚓</span>
                    <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                      {order.dockBay}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => printThermalLabel(order)}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                  title="Print 4x6 inch thermal barcode label"
                >
                  🏷️ 4x6-Inch Label
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPrintModalOpen(true)}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                >
                  🖨️ Packing Slip
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => printDeliveryChallan(order)}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                >
                  📄 Challan
                </button>
              </div>
            </div>

            {/* Workflow Stage Progression Pipeline */}
            <div style={{ margin: '1.75rem 0' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Fulfillment Stage Pipeline
              </h4>
              <div className="stepper-container">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const isCompleted = currentStepIndex > idx || order.status === 'DISPATCHED';
                  const isActive = order.status === step.key;
                  return (
                    <div key={step.key} className={`step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                      <div className="step-circle">
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <div className="step-label">{step.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Guided Next Action Button */}
            <div style={{ margin: '1.5rem 0', padding: '1.25rem', background: 'var(--bg-paper-lighter)', border: '1px solid var(--border-dark)', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                    Next Workflow Step
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {order.status === 'RECEIVED' && 'Order is queued. Pick items from rack and scan to begin packing.'}
                    {order.status === 'PICKING' && 'Items gathered. Box them up and record box count & weight.'}
                    {order.status === 'PACKING' && 'Box is packed. Perform quality and seal check.'}
                    {order.status === 'QUALITY_CHECK' && 'Inspection complete. Move shipment to outbound loading bay.'}
                    {order.status === 'STAGED' && 'Shipment ready at dock. Hand over to carrier and record LR details.'}
                    {order.status === 'DISPATCHED' && 'Order is fully fulfilled and on the road.'}
                    {order.status === 'ON_HOLD' && 'Order is currently flagged on hold.'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {order.status === 'RECEIVED' && (
                    <button className="btn-accent" onClick={() => handleAdvanceStatus('PICKING')} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem' }}>
                      ▶ START PICKING
                    </button>
                  )}
                  {order.status === 'PICKING' && (
                    <button className="btn-accent" onClick={() => handleAdvanceStatus('PACKING')} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem' }}>
                      📦 MARK PACKED
                    </button>
                  )}
                  {order.status === 'PACKING' && (
                    <button className="btn-accent" onClick={() => handleAdvanceStatus('QUALITY_CHECK')} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem' }}>
                      🔍 PASS QC INSPECTION
                    </button>
                  )}
                  {order.status === 'QUALITY_CHECK' && (
                    <button className="btn-accent" onClick={() => handleAdvanceStatus('STAGED')} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem' }}>
                      ⚓ STAGE AT LOADING DOCK
                    </button>
                  )}
                  {order.status === 'STAGED' && (
                    <button className="btn-green" onClick={() => handleAdvanceStatus('DISPATCHED')} style={{ fontSize: '1rem', padding: '0.65rem 1.5rem' }}>
                      🚚 COMPLETE DISPATCH
                    </button>
                  )}
                  {order.status !== 'ON_HOLD' && order.status !== 'DISPATCHED' && (
                    <button className="btn-rust" onClick={() => handleAdvanceStatus('ON_HOLD')} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                      ⚠️ Put on Hold
                    </button>
                  )}
                  {order.status === 'ON_HOLD' && (
                    <button className="btn-accent" onClick={() => handleAdvanceStatus('RECEIVED')} style={{ fontSize: '0.9rem', padding: '0.5rem 1.25rem' }}>
                      🔄 Release from Hold
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Manifest Details Table */}
            <table className="manifest-table" style={{ marginTop: '1.5rem' }}>
              <tbody>
                <tr>
                  <th style={{ width: '160px' }}>Invoice No.</th>
                  <td>{order.invoiceNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <th style={{ width: '160px' }}>LR / Docket No.</th>
                  <td>{order.lrNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
                <tr>
                  <th>Transporter</th>
                  <td>{order.transporter || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <th>Vehicle Plate</th>
                  <td>{order.vehicleNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
                <tr>
                  <th>Boxes / Units</th>
                  <td>{order.boxCount} Box(es)</td>
                  <th>Consignment Weight</th>
                  <td>{order.weightKg ? `${order.weightKg} kg` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
                {order.notes && (
                  <tr>
                    <th>Special Notes</th>
                    <td colSpan="3">{order.notes}</td>
                  </tr>
                )}
                <tr>
                  <th>Entered By</th>
                  <td className="mono" style={{ fontSize: '0.82rem' }}>
                    {order.enteredBy} · {new Date(order.enteredAt).toLocaleString()}
                  </td>
                  <th>Last Milestone</th>
                  <td className="mono" style={{ fontSize: '0.82rem' }}>
                    {order.dispatchedAt ? `Dispatched at ${new Date(order.dispatchedAt).toLocaleString()}` :
                     order.packedAt ? `Packed by ${order.packedBy} at ${new Date(order.packedAt).toLocaleTimeString()}` :
                     order.pickedAt ? `Picked by ${order.pickedBy} at ${new Date(order.pickedAt).toLocaleTimeString()}` :
                     order.updatedBy ? `Updated by ${order.updatedBy}` : 'Registered'}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Excel Raw Extra Attributes */}
            {(() => {
              const extras = getExtraFields(order);
              if (!extras || Object.keys(extras).length === 0) return null;
              return (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Imported Excel Attributes
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.5rem' }}>
                    {Object.entries(extras).map(([k, v]) => (
                      <div key={k} style={{ padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '2px' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{k}</div>
                        <div className="mono" style={{ fontSize: '0.88rem', wordBreak: 'break-all' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Audit History Timeline */}
            {order.events && order.events.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Fulfillment Audit Timeline
                </h4>
                <div className="timeline-list">
                  {order.events.map((ev) => (
                    <div key={ev.id} className="timeline-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className={`status-badge ${ev.status}`}>{ev.status.replace('_', ' ')}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ev.actorName}</span>
                        <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {new Date(ev.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {ev.note && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {ev.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────────────────────── */}
        {/* NOT FOUND: Quick Entry Form */}
        {/* ───────────────────────────────────────── */}
        {isSearched && !order && (
          <div style={{ marginTop: '2.5rem', position: 'relative' }}>
            <div className="ink-stamp not-found">NOT ON FILE</div>

            <h3 style={{ marginBottom: '0.25rem' }}>
              Order <span className="mono">{search.toUpperCase()}</span> Not In Register
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Scan or enter details below to register this shipment into the warehouse system.
            </p>
            <hr />

            <form onSubmit={handleSaveNew} className="grid-2" style={{ marginTop: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Warehouse Location (Zone / Rack / Bin)</label>
                <input
                  type="text"
                  placeholder="e.g. Zone A - R04 - B12"
                  value={newForm.zone}
                  onChange={(e) => setNewForm({ ...newForm, zone: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Order Priority</label>
                <select
                  value={newForm.priority}
                  onChange={(e) => setNewForm({ ...newForm, priority: e.target.value })}
                >
                  <option value="STANDARD">Standard</option>
                  <option value="EXPRESS">Express</option>
                  <option value="URGENT">Urgent (High Priority)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Invoice No.</label>
                <input
                  type="text"
                  value={newForm.invoiceNo}
                  onChange={(e) => setNewForm({ ...newForm, invoiceNo: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>LR / Docket No.</label>
                <input
                  type="text"
                  value={newForm.lrNo}
                  onChange={(e) => setNewForm({ ...newForm, lrNo: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Transporter / Carrier</label>
                <input
                  type="text"
                  placeholder="e.g. BlueDart, VRL Logistics"
                  value={newForm.transporter}
                  onChange={(e) => setNewForm({ ...newForm, transporter: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Box Count &amp; Weight (kg)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="Boxes"
                    value={newForm.boxCount}
                    onChange={(e) => setNewForm({ ...newForm, boxCount: e.target.value })}
                    style={{ width: '45%' }}
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Weight (kg)"
                    value={newForm.weightKg}
                    onChange={(e) => setNewForm({ ...newForm, weightKg: e.target.value })}
                    style={{ width: '55%' }}
                  />
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Notes / Special Instructions</label>
                <textarea
                  rows="2"
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  placeholder="Fragile items, specific handling, remarks..."
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <button type="submit" disabled={loading} style={{ width: '100%', fontSize: '1rem', padding: '0.85rem' }}>
                  {loading ? 'REGISTERING...' : 'REGISTER IN WAREHOUSE INVENTORY'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────── */}
      {/* Step Transition Modal */}
      {/* ───────────────────────────────────────── */}
      {stepModal.open && (
        <div className="modal-overlay" onClick={() => setStepModal({ ...stepModal, open: false })}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.5rem' }}>
              Advance Order to: <span style={{ color: 'var(--accent-blue)' }}>{stepModal.targetStatus.replace('_', ' ')}</span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Confirm step completion and update warehouse freight parameters.
            </p>
            <hr />

            <form onSubmit={submitStepTransition} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {stepModal.targetStatus === 'PACKING' && (
                <div className="grid-2">
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Package / Box Count</label>
                    <input
                      type="number"
                      min="1"
                      value={stepModal.boxCount}
                      onChange={(e) => setStepModal({ ...stepModal, boxCount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Gross Weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 12.5"
                      value={stepModal.weightKg}
                      onChange={(e) => setStepModal({ ...stepModal, weightKg: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {stepModal.targetStatus === 'STAGED' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Outbound Staging Bay / Dock Door</label>
                  <input
                    type="text"
                    placeholder="e.g. Bay 3 / Door 12"
                    value={stepModal.dockBay}
                    onChange={(e) => setStepModal({ ...stepModal, dockBay: e.target.value })}
                    required
                  />
                </div>
              )}

              {stepModal.targetStatus === 'DISPATCHED' && (
                <>
                  <div className="grid-2">
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Transporter / Carrier</label>
                      <input
                        type="text"
                        placeholder="e.g. BlueDart, TCI Express"
                        value={stepModal.transporter}
                        onChange={(e) => setStepModal({ ...stepModal, transporter: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Truck / Vehicle Plate No.</label>
                      <input
                        type="text"
                        placeholder="e.g. DL-01-AB-1234"
                        value={stepModal.vehicleNo}
                        onChange={(e) => setStepModal({ ...stepModal, vehicleNo: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>LR / Docket Number</label>
                      <input
                        type="text"
                        placeholder="LR Number"
                        value={stepModal.lrNo}
                        onChange={(e) => setStepModal({ ...stepModal, lrNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Invoice Number</label>
                      <input
                        type="text"
                        placeholder="Invoice Number"
                        value={stepModal.invoiceNo}
                        onChange={(e) => setStepModal({ ...stepModal, invoiceNo: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Milestone Remarks / Log Note</label>
                <textarea
                  rows="2"
                  placeholder="Optional note for timeline..."
                  value={stepModal.notes}
                  onChange={(e) => setStepModal({ ...stepModal, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? 'UPDATING...' : `CONFIRM ${stepModal.targetStatus.replace('_', ' ')}`}
                </button>
                <button type="button" className="secondary" onClick={() => setStepModal({ ...stepModal, open: false })}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────── */}
      {/* Barcode / Camera Scanner Modal */}
      {/* ───────────────────────────────────────── */}
      {scannerOpen && (
        <div className="modal-overlay" onClick={() => setScannerOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h3>📷 Barcode / QR Scanner</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.5rem 0 1rem' }}>
              Align the parcel barcode or shipping QR code within the viewfinder.
            </p>

            <div style={{
              position: 'relative', width: '100%', height: '240px', background: '#1a1a1a',
              borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', border: '2px dashed var(--accent-blue)', width: '80%', height: '60%',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)', borderRadius: '4px'
              }} />
              <div style={{
                position: 'absolute', width: '80%', height: '2px', background: 'var(--accent-rust)',
                boxShadow: '0 0 8px var(--accent-rust)', animation: 'scan-laser 1.5s infinite alternate ease-in-out'
              }} />
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Quick Test Simulators:
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="secondary" onClick={() => handleSimulateScan('ORD-1001')} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                  Simulate &quot;ORD-1001&quot;
                </button>
                <button type="button" className="secondary" onClick={() => handleSimulateScan('ORD-1002')} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                  Simulate &quot;ORD-1002&quot;
                </button>
              </div>
            </div>

            <button type="button" className="secondary" onClick={() => setScannerOpen(false)} style={{ marginTop: '1.25rem', width: '100%' }}>
              Close Scanner
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────── */}
      {/* Printable Packing Slip Modal */}
      {/* ───────────────────────────────────────── */}
      {printModalOpen && order && (
        <div className="modal-overlay" onClick={() => setPrintModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="printable-area" style={{ border: '2px solid #000', padding: '2rem', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.4rem' }}>WAREHOUSE PACKING SLIP</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>LOGISTICS &amp; FULFILLMENT DIVISION</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{order.orderNo}</div>
                  <div style={{ fontSize: '0.8rem' }}>{new Date().toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.25rem 0', fontSize: '0.9rem' }}>
                <div>
                  <strong>Storage Zone:</strong> {order.zone || 'N/A'}<br />
                  <strong>Priority:</strong> {order.priority}<br />
                  <strong>Box Count:</strong> {order.boxCount} PKG<br />
                  <strong>Gross Weight:</strong> {order.weightKg ? `${order.weightKg} KG` : '—'}
                </div>
                <div>
                  <strong>Dock / Bay:</strong> {order.dockBay || 'N/A'}<br />
                  <strong>Transporter:</strong> {order.transporter || '—'}<br />
                  <strong>LR Number:</strong> {order.lrNo || '—'}<br />
                  <strong>Invoice Number:</strong> {order.invoiceNo || '—'}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', margin: '1rem 0' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ border: '1px solid #000', padding: '6px' }}>Item / Description</th>
                    <th style={{ border: '1px solid #000', padding: '6px', width: '80px' }}>Status</th>
                    <th style={{ border: '1px solid #000', padding: '6px', width: '80px' }}>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '8px' }}>
                      Order Consignment {order.orderNo}<br />
                      <small style={{ color: '#555' }}>{order.notes || 'Standard packaging'}</small>
                    </td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{order.status}</td>
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>[ &nbsp; ]</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', paddingTop: '1rem', borderTop: '1px dotted #000' }}>
                <div>
                  Picker Signature: __________________<br />
                  <small>Operator: {order.pickedBy || currentUser?.name || 'Worker'}</small>
                </div>
                <div>
                  QC / Security Gate: __________________<br />
                  <small>Gate Pass Verified</small>
                </div>
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={() => window.print()} style={{ flex: 1 }}>
                🖨️ PRINT SLIP
              </button>
              <button className="secondary" onClick={() => setPrintModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Camera Modal */}
      {scannerOpen && (
        <BarcodeScanner
          title="Scan Consignment Barcode / QR"
          onScan={(code) => {
            setSearch(code);
            setScannerOpen(false);
            if (typeof handleSearch === 'function') {
              handleSearch(null, code);
            }
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
