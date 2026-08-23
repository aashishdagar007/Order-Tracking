'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const router = useRouter();

  // Auto-check existing session on load
  useEffect(() => {
    async function checkExisting() {
      try {
        const token = localStorage.getItem('wms_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/auth', { headers });
        const data = await res.json();
        if (data.user) {
          if (data.user.role === 'ADMIN') {
            router.push('/admin');
            return;
          } else {
            router.push('/worker');
            return;
          }
        }
      } catch (e) {}
      setCheckingExisting(false);
    }
    checkExisting();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim()) {
      setError('Please enter your username or full name');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: username.trim(), password })
      });
      const data = await res.json();

      if (res.ok) {
        if (data.token) {
          localStorage.setItem('wms_auth_token', data.token);
        }
        if (data.user) {
          localStorage.setItem('wms_user', JSON.stringify(data.user));
        }

        if (data.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/worker');
        }
      } else {
        setError(data.error || 'Invalid credentials. Please try again.');
      }
    } catch {
      setError('Connection error. Please check your network.');
    }
    setLoading(false);
  };

  if (checkingExisting) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'var(--font-sans)', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📦</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Opening Warehouse Management...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '1.5rem'
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '1.75rem',
            marginBottom: '1rem',
            border: '1px solid #e2e8f0'
          }}>
            📦
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.25rem', color: '#0f172a' }}>
            Warehouse Management
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Fulfillment, Scanning &amp; Inventory Terminal
          </p>
        </div>

        <div className="document-container" style={{ margin: 0, padding: '2.25rem' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Username */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
                Username / Operator ID
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or worker1"
                autoComplete="username"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: '#334155' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div style={{
                padding: '0.75rem 1rem', background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: '6px',
                color: '#dc2626', fontSize: '0.88rem', fontWeight: 500
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.95rem', padding: '0.8rem' }}>
              {loading ? 'AUTHENTICATING...' : 'SIGN IN TO DASHBOARD'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#64748b', textAlign: 'center', lineHeight: 1.6 }}>
            Default Admin: <strong style={{ color: '#0f172a' }}>admin</strong> / <strong style={{ color: '#0f172a' }}>admin123</strong><br />
            Worker accounts are created &amp; managed by Admins.
          </div>
        </div>
      </div>
    </div>
  );
}
