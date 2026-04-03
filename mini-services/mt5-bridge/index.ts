import { Server } from 'socket.io';

const PORT = 3005;
const io = new Server(PORT, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

console.log(`[MT5 Bridge] Listening on port ${PORT}`);

// In-memory state (in production, this connects to real MT5 via gRPC/REST)
interface MT5Order {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  price: number;
  sl: number;
  tp: number;
  profit: number;
  openTime: string;
  status: 'OPEN' | 'CLOSED';
}

let isConnected = false;
const orders: MT5Order[] = [];
let ticketCounter = 100000;

// Generate mock orders
function seedMockOrders() {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
  symbols.forEach((sym, i) => {
    const isBuy = i % 2 === 0;
    orders.push({
      ticket: ticketCounter++,
      symbol: sym,
      type: isBuy ? 'BUY' : 'SELL',
      lots: 0.01 + Math.random() * 0.09,
      price: isBuy ? 1.0850 + i * 0.01 : 1.0850 + i * 0.01,
      sl: isBuy ? 1.0830 + i * 0.01 : 1.0870 + i * 0.01,
      tp: isBuy ? 1.0900 + i * 0.01 : 1.0800 + i * 0.01,
      profit: (Math.random() - 0.3) * 50,
      openTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      status: 'OPEN',
    });
  });
}

seedMockOrders();

io.on('connection', (socket) => {
  console.log(`[MT5 Bridge] Client connected: ${socket.id}`);

  socket.on('ping', () => {
    socket.emit('pong', { connected: isConnected, orders: orders.length, timestamp: new Date().toISOString() });
  });

  socket.on('connect_mt5', (data: { account: string; server: string; password: string }) => {
    console.log(`[MT5 Bridge] Connect request: ${data.account}@${data.server}`);
    // Simulate connection
    setTimeout(() => {
      isConnected = true;
      socket.emit('mt5_status', { connected: true, account: data.account, balance: 10000, equity: 10000 });
      io.emit('mt5_status', { connected: true, account: data.account });
    }, 1500);
  });

  socket.on('disconnect_mt5', () => {
    isConnected = false;
    console.log('[MT5 Bridge] Disconnected from MT5');
    io.emit('mt5_status', { connected: false });
  });

  socket.on('get_orders', () => {
    socket.emit('orders', orders);
  });

  socket.on('send_order', (data: { symbol: string; type: 'BUY' | 'SELL'; lots: number; price: number; sl: number; tp: number }) => {
    console.log(`[MT5 Bridge] Order: ${data.type} ${data.lots} ${data.symbol} @ ${data.price}`);
    const order: MT5Order = {
      ticket: ticketCounter++,
      symbol: data.symbol,
      type: data.type,
      lots: data.lots,
      price: data.price,
      sl: data.sl,
      tp: data.tp,
      profit: 0,
      openTime: new Date().toISOString(),
      status: 'OPEN',
    };
    orders.push(order);
    socket.emit('order_result', { success: true, ticket: order.ticket });
    io.emit('orders', orders);
  });

  socket.on('close_order', (data: { ticket: number }) => {
    const order = orders.find(o => o.ticket === data.ticket);
    if (order) {
      order.status = 'CLOSED';
      order.profit = (Math.random() - 0.4) * 100;
      socket.emit('order_result', { success: true, ticket: order.ticket, closed: true });
      io.emit('orders', orders);
    }
  });

  socket.on('close_all', () => {
    orders.forEach(o => {
      o.status = 'CLOSED';
      o.profit = (Math.random() - 0.4) * 100;
    });
    socket.emit('order_result', { success: true, allClosed: true });
    io.emit('orders', orders);
  });

  socket.on('get_balance', () => {
    socket.emit('balance', { balance: 10000, equity: 10000, margin: 0, freeMargin: 10000, marginLevel: 0 });
  });

  socket.on('disconnect', () => {
    console.log(`[MT5 Bridge] Client disconnected: ${socket.id}`);
  });
});

// Simulate price updates
setInterval(() => {
  if (isConnected) {
    orders.forEach(o => {
      if (o.status === 'OPEN') {
        o.profit += (Math.random() - 0.48) * 5;
      }
    });
    io.emit('orders', orders);
  }
}, 3000);

console.log(`[MT5 Bridge] Ready. Mock orders: ${orders.length}`);
