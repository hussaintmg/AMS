import { useEffect, useRef } from 'react';

export default function useModalKeyboard(isOpen, onClose, onSubmit, loading = false) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && onSubmitRef.current) {
        const tag = e.target?.tagName;
        if (tag === 'TEXTAREA') return;
        if (submittingRef.current || loading) return;

        e.preventDefault();
        submittingRef.current = true;
        const result = onSubmitRef.current();
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).finally(() => {
            submittingRef.current = false;
          });
        } else {
          submittingRef.current = false;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading]);
}
