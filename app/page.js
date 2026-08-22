'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [role, setRole] = useState('WORKER');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    if (!name.trim()) {
      setError('Please enter your name');
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', role, name: name.trim(), password })
      });
      const data = await res.json();
      
      if (res.ok) {
        if (data.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/worker');
        }
      } else {
        setError(data.error || 'Invalid password. Please try again.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
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
              SHIPMENT REGISTER
            </h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
            Warehouse Tracking System
          </p>
        </div>

        <div className="document-container" style={{ margin: 0, padding: '2rem' }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Role Toggle */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Access Role
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.75rem',
                  border: `2px solid ${role === 'WORKER' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  background: role === 'WORKER' ? 'rgba(61,90,128,0.08)' : 'transparent',
                  cursor: 'pointer', borderRadius: '2px', fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}>
                  <input type="radio" name="role" value="WORKER" checked={role === 'WORKER'} 
                    onChange={() => setRole('WORKER')} style={{ width: 'auto' }} />
                  Worker
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: '0.75rem',
                  border: `2px solid ${role === 'ADMIN' ? 'var(--accent-rust)' : 'var(--border-color)'}`,
                  background: role === 'ADMIN' ? 'rgba(178,74,53,0.08)' : 'transparent',
                  cursor: 'pointer', borderRadius: '2px', fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}>
                  <input type="radio" name="role" value="ADMIN" checked={role === 'ADMIN'} 
                    onChange={() => setRole('ADMIN')} style={{ width: 'auto' }} />
                  Admin
                </label>
              </div>
            </div>

            {/* Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your Name
              </label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name" required />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password" required />
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
              {loading ? 'SIGNING IN...' : 'SIGN IN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
