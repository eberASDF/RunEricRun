export function withoutBroadcastHttp(fetcher) {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (new URL(url).pathname.startsWith('/realtime/v1/api/broadcast')) {
      return Promise.reject(new Error('Broadcast requires a subscribed WebSocket.'));
    }
    return fetcher(input, init);
  };
}
