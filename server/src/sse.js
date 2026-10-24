// SSE transport for one run. The event kind lives inside `data` and we use the
// default `message` event (ARCHITECTURE §3). `id` is the seq, so a reconnecting
// EventSource sends Last-Event-ID and only gets what it missed.

const HEARTBEAT_MS = 15_000;

export function formatEvent(evt) {
  return `id: ${evt.seq}\ndata: ${JSON.stringify(evt)}\n\n`;
}

export function streamRun(req, res, run) {
  const lastId = Number(req.get('last-event-id') ?? req.query.lastEventId ?? 0) || 0;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');

  for (const evt of run.history) {
    if (evt.seq > lastId) res.write(formatEvent(evt));
  }

  // Finished runs: send the history and end. The client closes on run.complete.
  if (run.closed) return res.end();

  const heartbeat = setInterval(() => res.write(': hb\n\n'), HEARTBEAT_MS);
  const unsubscribe = run.subscribe((evt) => {
    if (evt) return res.write(formatEvent(evt));
    cleanup();
    res.end();
  });

  function cleanup() {
    clearInterval(heartbeat);
    unsubscribe();
  }
  req.on('close', cleanup);
}
