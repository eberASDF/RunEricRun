export function createJumpTransport(url = '') {
  let socket = null;
  let status = 'Sin conexión';
  const listeners = new Set();
  const emit = () => listeners.forEach(listener => listener(status));
  return {
    getStatus: () => status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    connect() {
      if (!url || socket) return;
      status = 'Conectando'; emit();
      socket = new WebSocket(url);
      socket.onopen = () => { status = 'Conectado'; emit(); };
      socket.onclose = () => { socket = null; status = 'Sin conexión'; emit(); };
      socket.onerror = () => { status = 'Sin conexión'; emit(); };
    },
    sendJump() {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type: 'jump' }));
      return true;
    },
    disconnect() { socket?.close(); socket = null; status = 'Sin conexión'; emit(); },
  };
}
