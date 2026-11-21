// Apply the saved preference before the page paints.
(() => {
  let theme;
  try { theme = localStorage.getItem('bt-theme'); } catch { /* Storage may be unavailable. */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#302337' : '#F5EFE3');
})();
