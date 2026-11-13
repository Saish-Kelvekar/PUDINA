import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

// The backend runs Socket.IO on the same server as the API. In development the
// Vite proxy forwards /socket.io, so we connect to our own origin.
let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'], reconnectionDelay: 2000 });
  }
  return socket;
}

export type LiveIncidentEvent = { type: 'incident:new' | 'incident:verified'; incident: any };

/** Calls `onEvent` whenever an incident is reported or verified anywhere. */
export function useLiveIncidents(onEvent: (e: LiveIncidentEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const s = getSocket();
    const onNew = (p: any) => handler.current({ type: 'incident:new', incident: p?.incident });
    const onVerified = (p: any) => handler.current({ type: 'incident:verified', incident: p?.incident });
    s.on('incident:new', onNew);
    s.on('incident:verified', onVerified);
    return () => {
      s.off('incident:new', onNew);
      s.off('incident:verified', onVerified);
    };
  }, []);
}
