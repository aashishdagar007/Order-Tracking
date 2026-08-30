'use client';

import React, { useState, useEffect, useRef } from 'react';

/**
 * BarcodeScanner: High-speed in-browser camera scanner.
 * Uses native BarcodeDetector API if available, with automatic ZXing CDN fallback.
 * Supports Code128, QR Codes, EAN-13, DataMatrix, and UPC.
 */
export default function BarcodeScanner({ onScan, onClose, title = "Scan Order Barcode / QR Code" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScanned, setLastScanned] = useState('');
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      setErrorMsg('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraActive(true);
        }

        // Check torch support
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorch(true);
        }

        // Start scanning loop
        initDetector(stream);
      } catch (err) {
        setErrorMsg('Camera access denied or unavailable. Please ensure camera permissions are granted.');
      }
    }

    async function initDetector(stream) {
      // 1. Check for native BarcodeDetector
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'data_matrix', 'upc_a']
          });

          scanIntervalRef.current = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  handleDetected(barcodes[0].rawValue);
                }
              } catch (e) {}
            }
          }, 150);
          return;
        } catch (e) {}
      }

      // 2. Fallback: Load ZXing dynamically
      if (!window.ZXing) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@zxing/library@latest/umd/index.min.js';
        script.onload = () => setupZXing();
        document.head.appendChild(script);
      } else {
        setupZXing();
      }
    }

    function setupZXing() {
      if (!window.ZXing || !videoRef.current) return;
      try {
        const codeReader = new window.ZXing.BrowserMultiFormatReader();
        codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
          if (result) {
            handleDetected(result.getText());
          }
        });
      } catch (e) {}
    }

    function handleDetected(code) {
      if (!code || code === lastScanned) return;
      setLastScanned(code);

      // Play success audio beep
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1200;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (e) {}

      if (onScan) {
        onScan(code);
      }
    }

    startCamera();

    return () => {
      active = false;
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [onScan, lastScanned]);

  const toggleTorch = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn }]
        });
        setTorchOn(!torchOn);
      } catch (e) {}
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-paper, #ffffff)',
        borderRadius: '6px',
        maxWidth: '540px',
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color, #e2e8f0)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📸 {title}</h4>
          <button
            onClick={onClose}
            className="secondary"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Viewfinder Area */}
        <div style={{ position: 'relative', width: '100%', height: '360px', background: '#000', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted
            playsInline
          />

          {/* Aiming Reticle Overlay */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '260px',
            height: '160px',
            border: '2px solid rgba(255, 255, 255, 0.85)',
            borderRadius: '8px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none'
          }}>
            {/* Animated Scanning Laser */}
            <div style={{
              width: '100%',
              height: '2px',
              background: '#2563eb',
              boxShadow: '0 0 8px #2563eb',
              position: 'absolute',
              animation: 'scannerLaser 2s infinite ease-in-out'
            }} />
          </div>

          {errorMsg && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#ef4444',
              padding: '1rem',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: 'rgba(0,0,0,0.85)',
              borderRadius: '4px',
              maxWidth: '85%'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}
        </div>

        {/* Footer / Controls */}
        <div style={{
          padding: '0.85rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-paper-darker, #f8fafc)',
          fontSize: '0.85rem'
        }}>
          <div>
            {lastScanned ? (
              <span style={{ color: 'var(--accent-green, #16a34a)', fontWeight: 700 }}>
                ✓ Scanned: <code style={{ fontSize: '0.9rem' }}>{lastScanned}</code>
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted, #64748b)' }}>
                Center barcode or QR inside reticle
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {hasTorch && (
              <button
                type="button"
                className="secondary"
                onClick={toggleTorch}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                {torchOn ? '🔦 Torch Off' : '🔦 Torch On'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scannerLaser {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 1; }
          100% { top: 0%; opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
