/* Theme init (runs before paint) */
(function () {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

document.addEventListener('DOMContentLoaded', () => {
  /* Mobile nav */
  const mobileBtn = document.getElementById('nav-mobile-btn');
  const mobileMenu = document.getElementById('nav-mobile-menu');
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
  }

  /* Theme button */
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    const update = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      const icon = themeBtn.querySelector('.theme-icon');
      if (icon) icon.textContent = theme === 'dark' ? '☀' : '☽';
    };
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      update(current === 'dark' ? 'light' : 'dark');
    });
    const current = document.documentElement.getAttribute('data-theme');
    const icon = themeBtn.querySelector('.theme-icon');
    if (icon) icon.textContent = current === 'dark' ? '☀' : '☽';
  }

  /* Scroll: solid nav when not at top */
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
});
