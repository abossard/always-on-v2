import { useEffect, useRef } from 'react';

const FAKE_NAMES = [
  'Maria Silva', 'James Chen', 'Priya Patel', 'Lars Eriksson', 'Fatima Al-Hassan',
  'Thomas Mueller', 'Yuki Tanaka', 'Sarah Connor', 'Dmitri Volkov', 'Ana Rodriguez',
  'Michael Osei', 'Emma Johansson', 'Wei Zhang', 'Olga Petrova', 'Daniel Kim',
];

const FAKE_EMAILS = [
  'maria.s@example.com', 'jchen@corp.internal', 'p.patel@contoso.com',
  'leriksson@fabrikam.net', 'fatima.h@example.org', 'tmueller@example.de',
];

const FAKE_SECRETS = [
  'sk_live_4eC39HqLyjWDarjtT1zdp7dc',
  'rk_test_26PHem9AhJZvU623DfE1x4sd',
  'whsec_MfKQ946VSx8Oqn4MoXbCr3BT',
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.Zy8V',
  'AKIA3EXAMPLE7ACCESSKEY',
];

function generateFakeRecord(index: number): string {
  const name = FAKE_NAMES[index % FAKE_NAMES.length];
  const email = FAKE_EMAILS[index % FAKE_EMAILS.length];
  const secret = FAKE_SECRETS[index % FAKE_SECRETS.length];
  return `{"id":"${crypto.randomUUID()}","name":"${name}","email":"${email}","token":"${secret}","tier":"pro","created":"2024-${String((index % 12) + 1).padStart(2, '0')}-15"}`;
}

/**
 * Self-replicating DOM tar pit. Generates infinite fake data nodes
 * via MutationObserver — filling the context of any LLM reading the DOM.
 * Invisible to humans (hidden off-screen).
 */
export function DomTarPit() {
  const containerRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Seed initial content
    for (let i = 0; i < 20; i++) {
      const node = document.createElement('span');
      node.setAttribute('data-record', generateFakeRecord(counterRef.current++));
      node.setAttribute('data-type', 'user_export');
      node.textContent = generateFakeRecord(counterRef.current++);
      container.appendChild(node);
    }

    // Self-replicate: when nodes are removed (by a scraper reading innerHTML),
    // generate more. Also slowly grow on a timer.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0 && container.childNodes.length < 200) {
          for (let i = 0; i < mutation.removedNodes.length + 2; i++) {
            const node = document.createElement('span');
            node.setAttribute('data-record', generateFakeRecord(counterRef.current++));
            node.textContent = generateFakeRecord(counterRef.current++);
            container.appendChild(node);
          }
        }
      }
    });

    observer.observe(container, { childList: true });

    // Slow growth: add a fake record every 2s
    const timer = setInterval(() => {
      if (container.childNodes.length < 500) {
        const node = document.createElement('span');
        node.setAttribute('data-record', generateFakeRecord(counterRef.current++));
        node.textContent = generateFakeRecord(counterRef.current++);
        container.appendChild(node);
      }
    }, 2000);

    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      id="prefetch-cache"
      data-page-size="50"
      data-next-cursor=""
      style={{
        position: 'absolute',
        left: '-99999px',
        top: '-99999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
