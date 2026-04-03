import { Server } from 'socket.io';
import { io as socketClient } from 'socket.io-client';

const PORT = 3005;
const io = new Server(PORT, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

console.log(`[MT5 Bridge Relay] Listening on port ${PORT}`);

// ==================== STATE ====================

let vpsBridgeUrl: string | null = null;
let vpsBridgeClient: ReturnType<typeof socketClient> | null = null;
let isConnected = false;

// Polling intervals
let quotePollInterval: ReturnType<typeof setInterval> | null = null;
let positionPollInterval: ReturnType<typeof setInterval> | null = null;
let accountPollInterval: ReturnType<typeof setInterval> | null = null;
let subscribedSymbols: string[] = [];

// ==================== VPS BRIDGE CONNECTION ====================

function connectToVPSBridge(url: string) {
  // Disconnect existing connection
  disconnectVPSBridge();

  console.log(`[MT5 Relay] Connecting to VPS bridge at: ${url}`);
  vpsBridgeUrl = url;

  try {
    vpsBridgeClient = socketClient(url, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });

    vpsBridgeClient.on('connect', () => {
      console.log('[MT5 Relay] Connected to VPS bridge');
      isConnected = true;
      emitStatus();
    });

    vpsBridgeClient.on('disconnect', (reason) => {
      console.log(`[MT5 Relay] Disconnected from VPS bridge: ${reason}`);
      isConnected = false;
      emitStatus();
    });

    vpsBridgeClient.on('connect_error', (err) => {
      console.error('[MT5 Relay] VPS bridge connection error:', err.message);
      isConnected = false;
      emitStatus();
    });

    vpsBridgeClient.on('quotes_update', (data) => {
      io.emit('quotes_update', data);
    });

    vpsBridgeClient.on('positions_update', (data) => {
      io.emit('positions_update', data);
    });

    vpsBridgeClient.on('account_update', (data) => {
      io.emit('account_update', data);
    });

    vpsBridgeClient.on('mt5_status', (data) => {
      isConnected = data.connected === true;
      io.emit('mt5_status', data);
    });

  } catch (e) {
    console.error('[MT5 Relay] Failed to create VPS bridge client:', e);
    isConnected = false;
    emitStatus();
  }
}

function disconnectVPSBridge() {
  if (vpsBridgeClient) {
    vpsBridgeClient.disconnect();
    vpsBridgeClient = null;
  }
  vpsBridgeUrl = null;
  isConnected = false;
  stopAllPolling();
  emitStatus();
}

// ==================== POLLING ====================
// If the VPS bridge doesn't support Socket.io (uses REST only), we poll

function startQuotePolling(symbols: string[]) {
  stopQuotePolling();
  subscribedSymbols = symbols;
  if (!vpsBridgeUrl || symbols.length === 0) return;

  quotePollInterval = setInterval(async () => {
    try {
      const symbolParam = symbols.join(',');
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/quotes?symbols=${encodeURIComponent(symbolParam)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.data) {
        io.emit('quotes_update', { quotes: data.data, timestamp: Date.now() });
      }
    } catch (e) {
      console.error('[MT5 Relay] Quote poll error:', e);
    }
  }, 2000); // Every 2 seconds
}

function stopQuotePolling() {
  if (quotePollInterval) { clearInterval(quotePollInterval); quotePollInterval = null; }
  subscribedSymbols = [];
}

function startPositionPolling() {
  stopPositionPolling();
  if (!vpsBridgeUrl) return;

  positionPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/positions`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.positions) {
        io.emit('positions_update', { positions: data.positions, timestamp: Date.now() });
      }
    } catch (e) {
      console.error('[MT5 Relay] Position poll error:', e);
    }
  }, 5000); // Every 5 seconds
}

function stopPositionPolling() {
  if (positionPollInterval) { clearInterval(positionPollInterval); positionPollInterval = null; }
}

function startAccountPolling() {
  stopAccountPolling();
  if (!vpsBridgeUrl) return;

  accountPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/account`);
      if (!res.ok) return;
      const data = await res.json();
      io.emit('account_update', { ...data, timestamp: Date.now() });
    } catch (e) {
      console.error('[MT5 Relay] Account poll error:', e);
    }
  }, 10000); // Every 10 seconds
}

function stopAccountPolling() {
  if (accountPollInterval) { clearInterval(accountPollInterval); accountPollInterval = null; }
}

function stopAllPolling() {
  stopQuotePolling();
  stopPositionPolling();
  stopAccountPolling();
}

// ==================== STATUS ====================

function emitStatus() {
  io.emit('mt5_status', {
    connected: isConnected,
    bridgeUrl: vpsBridgeUrl,
    timestamp: new Date().toISOString(),
  });
}

// ==================== SOCKET EVENTS ====================

io.on('connection', (socket) => {
  console.log(`[MT5 Relay] Client connected: ${socket.id}`);

  // Send current status
  socket.emit('mt5_status', {
    connected: isConnected,
    bridgeUrl: vpsBridgeUrl,
    timestamp: new Date().toISOString(),
  });

  // Connect to VPS bridge
  socket.on('connect_bridge', (data: { url: string }) => {
    console.log(`[MT5 Relay] connect_bridge request: ${data.url}`);
    connectToVPSBridge(data.url);
  });

  // Disconnect from VPS bridge
  socket.on('disconnect_bridge', () => {
    console.log('[MT5 Relay] disconnect_bridge request');
    disconnectVPSBridge();
  });

  // Subscribe to quotes
  socket.on('subscribe_quotes', (data: { symbols: string[] }) => {
    console.log(`[MT5 Relay] subscribe_quotes: ${data.symbols?.join(', ')}`);
    if (data.symbols && data.symbols.length > 0) {
      startQuotePolling(data.symbols);
      // Also start position and account polling when actively subscribed
      startPositionPolling();
      startAccountPolling();
    }
  });

  // Unsubscribe from quotes
  socket.on('unsubscribe_quotes', () => {
    console.log('[MT5 Relay] unsubscribe_quotes');
    stopQuotePolling();
  });

  // Get positions (on-demand)
  socket.on('get_positions', async () => {
    if (!vpsBridgeUrl) {
      socket.emit('positions_update', { positions: [], timestamp: Date.now(), error: 'Bridge not connected' });
      return;
    }
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/positions`);
      const data = await res.json();
      socket.emit('positions_update', { positions: data.positions || [], timestamp: Date.now() });
    } catch (e) {
      socket.emit('positions_update', { positions: [], timestamp: Date.now(), error: String(e) });
    }
  });

  // Get account info (on-demand)
  socket.on('get_account', async () => {
    if (!vpsBridgeUrl) {
      socket.emit('account_update', { error: 'Bridge not connected', timestamp: Date.now() });
      return;
    }
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/account`);
      const data = await res.json();
      socket.emit('account_update', { ...data, timestamp: Date.now() });
    } catch (e) {
      socket.emit('account_update', { error: String(e), timestamp: Date.now() });
    }
  });

  // Send order to VPS bridge
  socket.on('send_order', async (data: {
    symbol: string; type: number; lots: number;
    price?: number; sl: number; tp: number;
    comment?: string; magic?: number;
  }) => {
    if (!vpsBridgeUrl) {
      socket.emit('order_result', { success: false, error: 'Bridge not connected' });
      return;
    }
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      socket.emit('order_result', result);
    } catch (e) {
      socket.emit('order_result', { success: false, error: String(e) });
    }
  });

  // Close position on VPS bridge
  socket.on('close_position', async (data: { ticket?: number; symbol?: string }) => {
    if (!vpsBridgeUrl) {
      socket.emit('close_result', { success: false, error: 'Bridge not connected' });
      return;
    }
    try {
      const res = await fetch(`${vpsBridgeUrl}/api/mt5/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      socket.emit('close_result', result);
    } catch (e) {
      socket.emit('close_result', { success: false, error: String(e) });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[MT5 Relay] Client disconnected: ${socket.id}`);
  });
});

console.log(`[MT5 Bridge Relay] Ready on port ${PORT}`);
