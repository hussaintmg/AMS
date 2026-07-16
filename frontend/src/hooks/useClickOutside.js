import { useEffect, useRef } from 'react';

const DEFAULT_EVENTS = ['pointerdown', 'touchstart', 'mousedown'];

export default function useClickOutside(handler, { capture = true, events = DEFAULT_EVENTS } = {}) {
  const ref = useRef(null);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handlerRef.current(event);
    };

    events.forEach((type) => {
      document.addEventListener(type, listener, capture);
    });

    return () => {
      events.forEach((type) => {
        document.removeEventListener(type, listener, capture);
      });
    };
  }, [capture, events]);

  return ref;
}
