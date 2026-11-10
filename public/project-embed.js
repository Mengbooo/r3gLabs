/* Optional bridge for independently authored project pages. Never reads the parent DOM. */
(() => {
  if (window.parent === window) return;
  const embedId = new URLSearchParams(window.location.search).get('embed');
  if (!embedId) return;
  const parentOrigin = new URL(document.referrer || window.location.href).origin;
  const send = type => window.parent.postMessage({ type, embedId }, parentOrigin);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); send('r3g:close'); }
  });
  send('r3g:ready');
})();
