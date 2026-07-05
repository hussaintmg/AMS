import { useEffect, useRef } from 'react';

export default function useFormEnterSubmit(onSubmit, { isActive = true, loading = false } = {}) {
  const savedCallback = useRef(onSubmit);
  savedCallback.current = onSubmit;
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;

    const handler = (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.target.closest('.filter-bar')) return;
      if (e.target.closest('.sm-picker-dropdown')) return;
      if (e.target.closest('[data-enter-submit="false"]')) return;

      e.preventDefault();
      if (submittingRef.current || loading) return;

      submittingRef.current = true;
      const result = savedCallback.current();
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).finally(() => {
          submittingRef.current = false;
        });
      } else {
        submittingRef.current = false;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isActive, loading]);
}
