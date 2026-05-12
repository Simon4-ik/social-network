import { API } from "./api";

export type WSEvent = { type: string; payload: any };

export function connectWS(onEvent: (e: WSEvent) => void): WebSocket {
  const url = API.replace(/^http/, "ws") + "/api/ws";
  const ws = new WebSocket(url);
  ws.onmessage = (m) => {
    try {
      const env = JSON.parse(m.data);
      onEvent({ type: env.type, payload: typeof env.payload === "string" ? JSON.parse(env.payload) : env.payload });
    } catch {}
  };
  return ws;
}
