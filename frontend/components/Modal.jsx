'use client';

export default function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 pb-8">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`relative bg-card rounded-lg shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} border border-black/5 animate-fade-in max-h-[calc(100vh-6rem)] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
          <h3 className="font-display text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-muted hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
