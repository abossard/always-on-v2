"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function useEventSource(
  groupId: string | null,
  onMessage: (msg: ChatMessage) => void
) {
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!groupId) return;

    esRef.current?.close();
    // Connect directly to the API SSE endpoint (no Next.js proxy)
    const es = new EventSource(`${API_BASE}/api/groups/${groupId}/stream`);

    es.onmessage = (event) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data);
        // Validate required fields
        if (msg.id && msg.content && msg.senderName) {
          onMessageRef.current(msg);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 3 seconds
      setTimeout(() => connect(), 3000);
    };

    esRef.current = es;
  }, [groupId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
