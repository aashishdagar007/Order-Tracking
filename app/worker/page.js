'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WorkerDashboard() {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState(null);
  const [isSearched, setIsSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Auth check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth');
        const data = await res.json();
        if (!data.user) {
          router.push('/');
        }
      } catch {
        router.push('/');
      }
    }
    checkAuth();
  }, [router]);

  // New Order Form state (if NOT ON FILE)
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [sent, setSent] = useState(false);
  const [notes, setNotes] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  
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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setIsSearched(false);
    setOrder(null);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/orders?orderNo=${encodeURIComponent(search.trim())}`);
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder(data.order);
      } else {
        setInvoiceNo(''); setLrNo(''); setSent(false); setNotes('');
      }
      setIsSearched(true);
    } catch {
      setSaveMsg('Error loading order data. Please try again.');
    }
    setLoading(false);
  };

  const handleSaveNew = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo: search.trim(), invoiceNo, lrNo, sent, notes })
      });
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        setSaveMsg('');
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

  return (
    <div>
      {/* Nav */}
      <nav>
        <div className="logo">Shipment Register</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Worker View
          </span>
          <button className="secondary" onClick={handleLogout} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </nav>

      <div className="document-container">
        {/* Search */}
        <h2 style={{ marginBottom: '1.5rem' }}>Search Shipment Order</h2>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Enter Order Number (e.g. ORD-001)"
            style={{ fontSize: '1.1rem', flex: 1 }}
          />
          <button type="submit" disabled={loading} style={{ whiteSpace: 'nowrap', minWidth: '120px' }}>
            {loading ? 'Searching...' : 'SEARCH'}
          </button>
        </form>

        {/* FOUND: Order details */}
        {isSearched && order && (
          <div style={{ marginTop: '2.5rem', position: 'relative' }}>
            <div className={`ink-stamp ${order.sent ? 'dispatched' : 'pending'}`}>
              {order.sent ? 'DISPATCHED' : 'PENDING'}
            </div>
            
            <h3 style={{ marginBottom: '0.5rem' }}>
              Order: <span className="mono">{order.orderNo}</span>
            </h3>
            <hr />
            
            <table className="manifest-table" style={{ marginTop: '1rem' }}>
              <tbody>
                <tr>
                  <th style={{ width: '160px' }}>Invoice No.</th>
                  <td>{order.invoiceNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
                <tr>
                  <th>LR No.</th>
                  <td>{order.lrNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td style={{ fontWeight: 600, color: order.sent ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                    {order.sent ? 'Dispatched' : 'Pending'}
                  </td>
                </tr>
                {order.notes && <tr><th>Notes</th><td>{order.notes}</td></tr>}
                <tr>
                  <th>Filed By</th>
                  <td className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {order.enteredBy} &nbsp;·&nbsp; {new Date(order.enteredAt).toLocaleString()}
                  </td>
                </tr>
                {order.updatedBy && (
                  <tr>
                    <th>Last Edit</th>
                    <td className="mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {order.updatedBy} &nbsp;·&nbsp; {new Date(order.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Extra fields from Excel */}
            {(() => {
              const extras = getExtraFields(order);
              if (!extras || Object.keys(extras).length === 0) return null;
              return (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Additional Fields
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                    {Object.entries(extras).map(([k, v]) => (
                      <div key={k} style={{ padding: '0.5rem', background: 'var(--bg-paper-darker)', borderRadius: '2px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{k}</div>
                        <div className="mono" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* NOT FOUND: Entry form */}
        {isSearched && !order && (
          <div style={{ marginTop: '2.5rem', position: 'relative' }}>
            <div className="ink-stamp not-found">NOT ON FILE</div>
            
            <h3 style={{ marginBottom: '0.25rem' }}>
              Order <span className="mono">{search.toUpperCase()}</span> not found
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              This order is not in the register. Fill in the details below to add it.
            </p>
            <hr />

            <form onSubmit={handleSaveNew} className="grid-2" style={{ marginTop: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice No.</label>
                <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>LR No.</label>
                <input type="text" value={lrNo} onChange={(e) => setLrNo(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
                <select value={sent ? 'yes' : 'no'} onChange={(e) => setSent(e.target.value === 'yes')}>
                  <option value="no">Pending</option>
                  <option value="yes">Dispatched</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes / Remarks</label>
                <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional remarks..." />
              </div>
              {saveMsg && <div style={{ gridColumn: '1 / -1', color: 'var(--accent-rust)', fontWeight: 500 }}>{saveMsg}</div>}
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="submit" disabled={loading} style={{ width: '100%', fontSize: '1rem' }}>
                  {loading ? 'SAVING...' : 'SAVE TO REGISTER'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
