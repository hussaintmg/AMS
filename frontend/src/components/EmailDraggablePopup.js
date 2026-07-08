import React, { useRef, useEffect } from 'react';

function useModalKeyboard(closeFn) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeFn(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeFn]);
}

function useDraggable(ref, isOpen) {
  useEffect(() => {
    if (!isOpen) return;
    const el = ref.current;
    if (!el) return;
    let offsetX = 0, offsetY = 0;
    let startX = 0, startY = 0;
    const header = el.querySelector('.email-popup-header');
    if (!header) return;

    function initDrag(clientX, clientY) {
      offsetX = parseFloat(el.dataset.dragX || '0') || 0;
      offsetY = parseFloat(el.dataset.dragY || '0') || 0;
      startX = clientX;
      startY = clientY;
    }

    const onMouseDown = (e) => {
      if (e.target.closest('button,input,select,textarea,.btn,.email-css-color-btn,.email-overlay-close')) return;
      e.preventDefault();
      initDrag(e.clientX, e.clientY);
      document.onmousemove = onMouseMove;
      document.onmouseup = onMouseUp;
    };
    const onMouseMove = (e) => {
      const nextX = offsetX + e.clientX - startX;
      const nextY = offsetY + e.clientY - startY;
      el.dataset.dragX = String(nextX);
      el.dataset.dragY = String(nextY);
      el.style.transform = `translate(calc(-50% + ${nextX}px), calc(-50% + ${nextY}px))`;
    };
    const onMouseUp = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
    header.addEventListener('mousedown', onMouseDown);
    header.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      initDrag(t.clientX, t.clientY);
      document.ontouchmove = (ev) => {
        const touch = ev.touches[0];
        const nextX = offsetX + touch.clientX - startX;
        const nextY = offsetY + touch.clientY - startY;
        el.dataset.dragX = String(nextX);
        el.dataset.dragY = String(nextY);
        el.style.transform = `translate(calc(-50% + ${nextX}px), calc(-50% + ${nextY}px))`;
      };
      document.ontouchend = () => { document.ontouchmove = null; document.ontouchend = null; };
    }, { passive: true });
    return () => header.removeEventListener('mousedown', onMouseDown);
  }, [ref, isOpen]);
}

export function DraggableHeader({ children, onClose }) {
  return (
    <div className="email-popup-header">
      {children}
      <button className="email-overlay-close" onClick={onClose} type="button">&times;</button>
    </div>
  );
}

export default function DraggablePopup({ isOpen, onClose, children, className = '', style = {} }) {
  const popupRef = useRef(null);
  useModalKeyboard(onClose);
  useDraggable(popupRef, isOpen);
  return isOpen && (
    <div ref={popupRef} className={`email-draggable-popup ${className}`} style={style}>
      {children}
    </div>
  );
}
