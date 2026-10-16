"use client";

import { useEffect, useEffectEvent } from "react";
import type { ChatMessage } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useEventSource(
  groupId: string | null,
  onMessage: (msg: ChatMessage) => void
) {
  const handleMessage = useEffectEvent(onMessage);

  useEffect(() => {
    if (!groupId) return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    function connect() {
      source?.close();
      // Connect directly to the API SSE endpoint (no Next.js proxy)
      const es = new EventSource(`${API_BASE}/api/groups/${groupId}/stream`);
      source = es;

      es.onmessage = (event) => {
        try {
          const msg: ChatMessage = JSON.parse(event.data);
          // Validate required fields — join/leave events may have content as agentId
          if (msg.id && msg.senderName) {
            handleMessage(msg);
          }
        } catch (e) {
          console.warn("[SSE] Failed to parse event:", event.data, e);
        }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 3 seconds
        if (!disposed) reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [groupId]);
}
