/**
 * Warehouse Offline Engine (IndexedDB + 2-Way Sync)
 * Enables complete standalone operation on Android devices when host laptop is offline.
 */

const DB_NAME = 'WarehouseWMS_OfflineDB';
const DB_VERSION = 1;

let dbInstance = null;

export async function openOfflineDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // 1. Orders store
      if (!db.objectStoreNames.contains('orders')) {
        const orderStore = db.createObjectStore('orders', { keyPath: 'orderNo' });
        orderStore.createIndex('status', 'status', { unique: false });
        orderStore.createIndex('zone', 'zone', { unique: false });
        orderStore.createIndex('priority', 'priority', { unique: false });
        orderStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Offline Sync Queue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }

      // 3. Metadata store (lastSync, serverUrl, operator)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('IndexedDB open failed:', e);
      reject(e);
    };
  });
}

export async function getMeta(key, defaultValue = null) {
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
    req.onerror = () => resolve(defaultValue);
  });
}

export async function setMeta(key, value) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

export async function getAllOfflineOrders() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('orders', 'readonly');
    const store = tx.objectStore('orders');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

export async function getOfflineOrderByNo(orderNo) {
  if (!orderNo) return null;
  const db = await openOfflineDB();
  return new Promise((resolve) => {
    const cleanNo = String(orderNo).trim().toUpperCase();
    const tx = db.transaction('orders', 'readonly');
    const store = tx.objectStore('orders');
    const req = store.get(cleanNo);

    req.onsuccess = () => {
      if (req.result) return resolve(req.result);
      // Fallback search across invoiceNo or lrNo
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const found = (allReq.result || []).find(o =>
          (o.orderNo && o.orderNo.toUpperCase() === cleanNo) ||
          (o.invoiceNo && o.invoiceNo.toUpperCase() === cleanNo) ||
          (o.lrNo && o.lrNo.toUpperCase() === cleanNo)
        );
        resolve(found || null);
      };
      allReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function saveOfflineOrder(order) {
  if (!order || !order.orderNo) return;
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');
    const req = store.put({
      ...order,
      orderNo: order.orderNo.toUpperCase(),
      updatedAt: order.updatedAt || new Date().toISOString()
    });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

export async function advanceOfflineOrderStatus(orderNo, newStatus, extraData = {}) {
  const existing = await getOfflineOrderByNo(orderNo);
  const now = new Date().toISOString();
  const operatorName = (await getMeta('operatorName')) || 'Mobile Worker';

  let updatedOrder;
  if (existing) {
    updatedOrder = {
      ...existing,
      ...extraData,
      status: newStatus,
      updatedAt: now,
      updatedBy: operatorName
    };
    if (newStatus === 'PICKING' && !existing.pickedAt) {
      updatedOrder.pickedAt = now;
      updatedOrder.pickedBy = operatorName;
    } else if (newStatus === 'PACKING' && !existing.packedAt) {
      updatedOrder.packedAt = now;
      updatedOrder.packedBy = operatorName;
    } else if (newStatus === 'DISPATCHED') {
      updatedOrder.dispatchedAt = now;
      updatedOrder.sent = true;
    }
  } else {
    updatedOrder = {
      orderNo: orderNo.toUpperCase(),
      status: newStatus,
      priority: extraData.priority || 'STANDARD',
      boxCount: extraData.boxCount || 1,
      ...extraData,
      enteredBy: operatorName,
      enteredAt: now,
      updatedAt: now
    };
  }

  await saveOfflineOrder(updatedOrder);

  // Record into Sync Queue
  const db = await openOfflineDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.add({
      type: existing ? 'MUTATION' : 'NEW_ORDER',
      orderNo: orderNo.toUpperCase(),
      status: newStatus,
      actorName: operatorName,
      timestamp: now,
      data: extraData
    });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });

  return updatedOrder;
}

export async function getPendingSyncQueue() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

export async function clearSyncQueue() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

export async function syncWithHostServer(serverUrl) {
  const queue = await getPendingSyncQueue();
  const url = (serverUrl || (await getMeta('serverUrl')) || '').replace(/\/$/, '');

  if (!url) {
    throw new Error('Host server URL not configured');
  }

  // Split queue into mutations vs new orders
  const mutations = [];
  const newOrders = [];

  for (const item of queue) {
    if (item.type === 'NEW_ORDER') {
      const ord = await getOfflineOrderByNo(item.orderNo);
      if (ord) newOrders.push(ord);
    } else {
      mutations.push({
        orderNo: item.orderNo,
        status: item.status,
        actorName: item.actorName,
        timestamp: item.timestamp,
        ...item.data
      });
    }
  }

  // Push to server
  const pushRes = await fetch(`${url}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations, newOrders })
  });

  if (!pushRes.ok) {
    throw new Error(`Sync failed: Server returned HTTP ${pushRes.status}`);
  }

  const result = await pushRes.json();

  // On successful push, clear queue
  await clearSyncQueue();

  // Hydrate local cache with latest orders returned from server
  if (result.orders && Array.isArray(result.orders)) {
    for (const ord of result.orders) {
      await saveOfflineOrder(ord);
    }
  }

  await setMeta('lastSyncTime', new Date().toISOString());
  return result;
}
