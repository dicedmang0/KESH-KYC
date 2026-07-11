export type ToastItem = { id: number; message: string; type: 'success' | 'error' };
type Listener = (toasts: ToastItem[]) => void;

let _items: ToastItem[] = [];
let _nextId = 0;
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((l) => l([..._items]));
}

function _add(message: string, type: 'success' | 'error') {
  const id = ++_nextId;
  _items = [..._items, { id, message, type }];
  _notify();
  setTimeout(() => {
    _items = _items.filter((t) => t.id !== id);
    _notify();
  }, 4500);
}

export const toast = {
  success: (message: string) => _add(message, 'success'),
  error: (message: string) => _add(message, 'error'),
};

export function subscribeToToasts(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
