'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useWebSocket: Persistent, resilient WebSocket hook for real-time warehouse updates.
 * Auto-reconnects with exponential backoff.
 * 
 * @param {string} warehouseId - Current warehouse UUID or slug
 * @param {function} onMessage - Callback for received parsed JSON events
 */
export function useWebSocket(warehouseId, onMessage) {
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'
  const [activeConnections, setActiveConnections] = useState(1);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!warehouseId || typeof window === 'undefined') return;

    const token = localStorage.getItem('wms_auth_token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Connect to /ws/{warehouseId}?token={token} via Nginx reverse proxy
    // In dev without Nginx, port 8000 is used if configured
    let wsHost = window.location.host;
    // If running standalone on Next.js port 3000 during dev, route to 8000
    if (window.location.port === '3000') {
      wsHost = `${window.location.hostname}:8000`;
    }

    const wsUrl = `${protocol}//${wsHost}/ws/${warehouseId}?token=${encodeURIComponent(token)}`;

    setConnectionStatus('CONNECTING');
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CONNECTED') {
            if (data.connections) setActiveConnections(data.connections);
          } else if (data.type === 'HEARTBEAT') {
            // Respond with PING to keep connection warm
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PING' }));
            }
          }
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (e) {
          console.debug('WS non-JSON payload:', event.data);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        // Exponential backoff reconnect: 1s, 2s, 4s, up to 15s max
        const backoff = Math.min(1000 * (2 ** retryCountRef.current), 15000);
        retryCountRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoff);
      };

      ws.onerror = (err) => {
        ws.close();
      };
    } catch (e) {
      setConnectionStatus('DISCONNECTED');
    }
  }, [warehouseId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on manual unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }, []);

  return {
    connectionStatus,
    activeConnections,
    sendMessage,
  };
}
