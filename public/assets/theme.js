/* Shared theme toggle for the build-less v1 pages. Same rule as the Astro
   site (BaseLayout): a saved choice wins, otherwise follow the OS. */

(function(){
  function readSaved(){
    try { return localStorage.getItem('miuceo_theme'); } catch (e) { return null; }
  }
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('themeToggle');
    if(btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
  function initTheme(){
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(readSaved() || (dark ? 'dark' : 'light'));
    var btn = document.getElementById('themeToggle');
    if(btn){
      btn.addEventListener('click', function(){
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        var next = current === 'light' ? 'dark' : 'light';
        try { localStorage.setItem('miuceo_theme', next); } catch (e) {}
        applyTheme(next);
      });
    }
  }
  initTheme();
  window.miuceoInitTheme = initTheme;
})();
