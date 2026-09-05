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
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setCheckingExisting(false);
    }, 1500);

    async function checkExisting() {
      try {
        const token = localStorage.getItem('wms_auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/auth', { headers });
        const data = await res.json();
        if (active && data.user) {
          if (data.user.role === 'ADMIN') {
            router.push('/admin');
            return;
          } else if (data.user.role === 'CLIENT') {
            router.push('/client');
            return;
          } else {
            router.push('/worker');
            return;
          }
        }
      } catch (e) { }
      if (active) {
        clearTimeout(timeout);
        setCheckingExisting(false);
      }
    }
    checkExisting();

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim()) {
      setError('Please enter your username or operator ID');
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

        const role = data.role || data.user?.role;
        if (role === 'ADMIN') {
          router.push('/admin');
        } else if (role === 'CLIENT') {
          router.push('/client');
        } else {
          router.push('/worker');
        }
      } else {
        setError(data.error || 'Invalid credentials. Please verify and try again.');
      }
    } catch {
      setError('Connection failed. Please verify server status.');
    }
    setLoading(false);
  };

  if (checkingExisting) {
    return (
      <div className="ambient-glow-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div className="brand-icon" style={{ width: '54px', height: '54px', fontSize: '1.75rem', background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)' }}>
            📦
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Initializing LogiFlow Inventory...
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Connecting to local operational engine
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ambient-glow-bg" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '1.5rem',
      position: 'relative'
    }}>
      <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 1 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.32)',
            fontSize: '2rem',
            marginBottom: '1.25rem',
            color: '#ffffff'
          }}>
            📦
          </div>
          <h1 style={{ fontSize: '1.95rem', fontWeight: 800, margin: '0 0 0.35rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
            LogiFlow Inventory
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 500 }}>
            Unified Warehouse Management &amp; Fulfillment Platform
          </p>
        </div>

        {/* Login Surface Card */}
        <div className="card-pro" style={{ padding: '2.5rem', borderRadius: '18px', boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.3rem' }}>
            {/* Username Input */}
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Username / Operator ID</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>e.g. admin</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter operator username"
                  autoComplete="username"
                  required
                  style={{ paddingLeft: '2.5rem', fontSize: '0.95rem' }}
                />
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '1rem' }}>
                  👤
                </span>
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Password</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Encrypted</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  style={{ paddingLeft: '2.5rem', fontSize: '0.95rem' }}
                />
                <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '1rem' }}>
                  🔒
                </span>
              </div>
            </div>

            {/* Quick Role Selectors for 1-Click Fast Access */}
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Quick Login Presets:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setUsername('admin'); setPassword('admin123'); setError(''); }}
                  style={{
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: username === 'admin' ? '#eff6ff' : '#f8fafc',
                    color: username === 'admin' ? '#1d4ed8' : '#475569',
                    border: `1px solid ${username === 'admin' ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    boxShadow: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem'
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>👑</span>
                  <span>Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setUsername('worker'); setPassword('worker123'); setError(''); }}
                  style={{
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: username === 'worker' ? '#f0fdf4' : '#f8fafc',
                    color: username === 'worker' ? '#047857' : '#475569',
                    border: `1px solid ${username === 'worker' ? '#10b981' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    boxShadow: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem'
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>👷</span>
                  <span>Worker</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setUsername('client'); setPassword('client123'); setError(''); }}
                  style={{
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: username === 'client' ? '#f5f3ff' : '#f8fafc',
                    color: username === 'client' ? '#6d28d9' : '#475569',
                    border: `1px solid ${username === 'client' ? '#8b5cf6' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    boxShadow: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem'
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>🏢</span>
                  <span>Client</span>
                </button>
              </div>
            </div>

            {/* Error Message Display */}
            {error && (
              <div style={{
                padding: '0.75rem 1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '0.4rem',
                padding: '0.85rem',
                fontSize: '0.95rem',
                fontWeight: 700,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                letterSpacing: '0.01em'
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span style={{ fontSize: '1.1rem' }}>→</span>
                </>
              )}
            </button>
          </form>

          {/* Card Footer Info */}
          <div style={{
            marginTop: '1.75rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-default)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
            <span>Local Node.js Engine &bull; SQLite Persistence</span>
          </div>
        </div>
      </div>
    </div>
  );
}
