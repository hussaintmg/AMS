/**
 * Simple Event Bus for decoupled communication
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 *
 * Listeners must be removable: addEventListener/removeEventListener require the
 * same function reference. We wrap callbacks in a stable handler stored in a WeakMap.
 */

const handlerByCallback = new WeakMap();

const eventBus = {
    on(event, callback) {
        if (typeof callback !== 'function') return;
        eventBus.remove(event, callback);
        const handler = (e) => callback(e.detail);
        handlerByCallback.set(callback, handler);
        document.addEventListener(event, handler);
    },
    dispatch(event, data) {
        document.dispatchEvent(new CustomEvent(event, { detail: data }));
    },
    remove(event, callback) {
        const handler = handlerByCallback.get(callback);
        if (!handler) return;
        document.removeEventListener(event, handler);
        handlerByCallback.delete(callback);
    }
};

export default eventBus;
