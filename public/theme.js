// Run before the application paints to match the iPhone status bar and saved theme.
try {
  const theme =
    localStorage.getItem('kotoba-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === 'dark' ? '#242522' : '#faf9f6';
} catch {
  /* The reader also works when browser storage is unavailable. */
}
