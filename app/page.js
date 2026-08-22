'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, var(--bg-paper) 0%, var(--bg-paper-darker) 100%)'
    }}>
      <div style={{ width: '100%', maxWidth: '420px', padding: '1rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            border: '2px solid var(--border-dark)',
            marginBottom: '1rem'
          }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '0.05em' }}>
              WAREHOUSE WMS
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            Internal Fulfillment &amp; Operations Terminal
          </p>
        </div>

        <div className="document-container" style={{ margin: 0, padding: '2rem' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Username */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Username / Name
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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                padding: '0.75rem', background: 'rgba(178,74,53,0.1)',
                border: '1px solid var(--accent-rust)', borderRadius: '2px',
                color: 'var(--accent-rust)', fontSize: '0.9rem', fontWeight: 500
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem', fontSize: '1rem', letterSpacing: '0.05em' }}>
              {loading ? 'AUTHENTICATING...' : 'ACCESS TERMINAL'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dotted var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Default Admin: <span className="mono">admin</span> / <span className="mono">admin123</span><br />
            Worker accounts are created &amp; managed by Admins.
          </div>
        </div>
      </div>
    </div>
  );
}
