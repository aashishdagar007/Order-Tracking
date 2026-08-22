'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const [tab, setTab] = useState('orders');
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', { method: 'GET' });
      const data = await res.json();
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout', name: data.user?.name, role: data.user?.role })
      });
    } catch(e) {
      // Logout attempt continued even if there's an error
    }
    router.push('/');
  };

  return (
    <div>
      {/* Nav */}
      <nav>
        <div className="logo">Shipment Register</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0' }}>
            {[
              { key: 'orders', label: 'Orders' },
              { key: 'upload', label: 'Upload Excel' },
              { key: 'logs', label: 'Activity Log' },
              { key: 'settings', label: 'Settings' },
            ].map(t => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '0.5rem 1rem',
                  background: tab === t.key ? 'var(--text-main)' : 'transparent',
                  color: tab === t.key ? 'var(--bg-paper-lighter)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 0,
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}>
                {t.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-rust)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            ADMIN
          </span>
          <button className="secondary" onClick={handleLogout} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Logout
          </button>
        </div>
      </nav>

      <div style={{ padding: '1.5rem 2rem' }}>
        {tab === 'orders' && <OrdersTab />}
        {tab === 'upload' && <UploadTab />}
        {tab === 'logs' && <LogsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Orders Tab — Search & Edit
// ─────────────────────────────────────────
function OrdersTab() {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSearched, setIsSearched] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saveMsg, setSaveMsg] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setIsSearched(false);
    setOrder(null);
    setEditMode(false);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/orders?orderNo=${encodeURIComponent(search.trim())}`);
      const data = await res.json();
      if (res.ok && data.order) {
        setOrder(data.order);
        setEditForm({
          invoiceNo: data.order.invoiceNo || '',
          lrNo: data.order.lrNo || '',
          sent: data.order.sent,
          notes: data.order.notes || '',
        });
      }
      setIsSearched(true);
    } catch (err) {
      setSaveMsg('Error searching orders. Please try again.');
      setIsSearched(true);
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
        body: JSON.stringify({ orderNo: search.trim(), ...editForm })
      });
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        setSaveMsg('Order added successfully.');
      } else {
        setSaveMsg(data.error || 'Failed to save');
      }
    } catch(err) { setSaveMsg('Error saving'); }
    setLoading(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, orderNo: order.orderNo, ...editForm })
      });
      const data = await res.json();
      if (res.ok) {
        setOrder(data.order);
        setEditMode(false);
        setSaveMsg('Changes saved.');
      } else {
        setSaveMsg(data.error || 'Failed to save');
      }
    } catch(err) { setSaveMsg('Error saving'); }
    setLoading(false);
  };

  const getExtraFields = (o) => {
    if (!o?.extra) return null;
    try { return JSON.parse(o.extra); } catch(e) { return null; }
  };

  return (
    <div className="document-container" style={{ margin: '0 auto', maxWidth: '900px' }}>
      <h2>Order Lookup &amp; Edit</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Search any order number. If found, you can view or edit details. If not found, add it manually.
      </p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter Order Number"
          style={{ fontSize: '1.1rem', flex: 1 }}
        />
        <button type="submit" disabled={loading} style={{ minWidth: '120px' }}>
          {loading ? 'Searching...' : 'SEARCH'}
        </button>
      </form>

      {/* FOUND */}
      {isSearched && order && (
        <div style={{ marginTop: '2rem', position: 'relative' }}>
          <div className={`ink-stamp ${order.sent ? 'dispatched' : 'pending'}`}>
            {order.sent ? 'DISPATCHED' : 'PENDING'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3>Order: <span className="mono">{order.orderNo}</span></h3>
            <button className="secondary" onClick={() => { setEditMode(!editMode); setSaveMsg(''); }} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
              {editMode ? '✕ Cancel' : '✎ Edit'}
            </button>
          </div>
          <hr style={{ margin: '0.75rem 0 1.25rem' }} />

          {!editMode ? (
            <>
              <table className="manifest-table">
                <tbody>
                  <tr><th style={{ width: '160px' }}>Invoice No.</th><td>{order.invoiceNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td></tr>
                  <tr><th>LR No.</th><td>{order.lrNo || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td></tr>
                  <tr><th>Status</th><td style={{ fontWeight: 700, color: order.sent ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{order.sent ? 'Dispatched' : 'Pending'}</td></tr>
                  {order.notes && <tr><th>Notes</th><td>{order.notes}</td></tr>}
                  <tr><th>Filed By</th><td className="mono" style={{ fontSize: '0.85rem' }}>{order.enteredBy} · {new Date(order.enteredAt).toLocaleString()}</td></tr>
                  {order.updatedBy && <tr><th>Last Edit</th><td className="mono" style={{ fontSize: '0.85rem' }}>{order.updatedBy} · {new Date(order.updatedAt).toLocaleString()}</td></tr>}
                </tbody>
              </table>

              {/* Extra fields */}
              {(() => {
                const extras = getExtraFields(order);
                if (!extras || Object.keys(extras).length === 0) return null;
                return (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Excel Fields
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                      {Object.entries(extras).map(([k, v]) => (
                        <div key={k} style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-paper-darker)', borderRadius: '2px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>{k}</div>
                          <div className="mono" style={{ fontSize: '0.88rem', wordBreak: 'break-all' }}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <form onSubmit={handleSaveEdit} className="grid-2">
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Invoice No.</label>
                <input type="text" value={editForm.invoiceNo} onChange={(e) => setEditForm({...editForm, invoiceNo: e.target.value})} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>LR No.</label>
                <input type="text" value={editForm.lrNo} onChange={(e) => setEditForm({...editForm, lrNo: e.target.value})} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Status</label>
                <select value={editForm.sent ? 'yes' : 'no'} onChange={(e) => setEditForm({...editForm, sent: e.target.value === 'yes'})}>
                  <option value="no">Pending</option>
                  <option value="yes">Dispatched</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Notes</label>
                <textarea rows="2" value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem' }}>
                <button type="submit" disabled={loading}>{loading ? 'SAVING...' : 'SAVE CHANGES'}</button>
                <button type="button" className="secondary" onClick={() => setEditMode(false)}>Cancel</button>
              </div>
            </form>
          )}

          {saveMsg && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(58,122,81,0.1)', border: '1px solid var(--accent-green)', borderRadius: '2px', color: 'var(--accent-green)', fontWeight: 600 }}>
              {saveMsg}
            </div>
          )}
        </div>
      )}

      {/* NOT FOUND — Admin can add it */}
      {isSearched && !order && !loading && (
        <div style={{ marginTop: '2rem', position: 'relative' }}>
          <div className="ink-stamp not-found">NOT ON FILE</div>
          <h3>Add Order: <span className="mono">{search.toUpperCase()}</span></h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0 1.5rem' }}>
            This order is not in the register. Enter details to create a new record.
          </p>
          <hr />
          <form onSubmit={handleSaveNew} className="grid-2" style={{ marginTop: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Invoice No.</label>
              <input type="text" value={editForm.invoiceNo || ''} onChange={(e) => setEditForm({...editForm, invoiceNo: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>LR No.</label>
              <input type="text" value={editForm.lrNo || ''} onChange={(e) => setEditForm({...editForm, lrNo: e.target.value})} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Status</label>
              <select value={editForm.sent ? 'yes' : 'no'} onChange={(e) => setEditForm({...editForm, sent: e.target.value === 'yes'})}>
                <option value="no">Pending</option>
                <option value="yes">Dispatched</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Notes</label>
              <textarea rows="2" value={editForm.notes || ''} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} />
            </div>
            {saveMsg && <div style={{ gridColumn: '1 / -1', color: 'var(--accent-rust)', fontWeight: 500 }}>{saveMsg}</div>}
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'SAVING...' : 'ADD TO REGISTER'}
              </button>
            </div>
          </form>
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
    } catch(e) {
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
        Upload your Excel file. The system will automatically detect column headers (e.g. <span className="mono">Order Number</span>, <span className="mono">Invoice No.</span>, <span className="mono">Lr Number</span>, <span className="mono">Status</span>). New orders are added; existing orders have their blank fields filled in — <strong>no data is overwritten</strong>.
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
          {result.ok && (
            <div style={{ marginTop: '0.5rem', fontWeight: 400, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              You can now search any imported order number in the Orders tab.
            </div>
          )}
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

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async (nameFilter = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?name=${encodeURIComponent(nameFilter)}`);
      const data = await res.json();
      if (res.ok) setLogs(data.logs);
    } catch(e) {
      setLogs([]);
    }
    setLoading(false);
  };

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
    } catch(e) { setMsg('Error saving settings.'); setIsError(true); }
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
