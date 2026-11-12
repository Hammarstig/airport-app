import { startTransition, useEffect, useState } from 'react';

/**
 * Renderar barnen först efter första bildrutan (som en transition), så att sidans överdel
 * syns direkt vid navigering och tunga listor längre ned inte fördröjer den.
 */
export function Deferred({ children, fallback = null }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready ? children : fallback;
}
