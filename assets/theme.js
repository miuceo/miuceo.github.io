/* Shared theme toggle. */

(function(){
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('themeToggle');
    if(btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
  function initTheme(){
    var saved = localStorage.getItem('miuceo_theme') || 'dark';
    applyTheme(saved);
    var btn = document.getElementById('themeToggle');
    if(btn){
      btn.addEventListener('click', function(){
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'light' ? 'dark' : 'light';
        localStorage.setItem('miuceo_theme', next);
        applyTheme(next);
      });
    }
  }
  initTheme();
  window.miuceoInitTheme = initTheme;
})();
