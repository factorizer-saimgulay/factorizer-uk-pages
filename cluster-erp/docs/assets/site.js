/* Cluster ERP wiki: client behaviour. No network calls beyond the site's own
   files; Mermaid is served from assets/, the search index is a local JSON. */
(function () {
  'use strict';
  const script = document.currentScript || document.querySelector('script[data-root]');
  const root = (script && script.dataset.root) || '';
  const lang = (script && script.dataset.lang) || 'en';

  /* ---------------------------------------------------------------- mobile menu */
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------------------------------------------------------------- diagrams */
  function startMermaid() {
    if (!window.mermaid) return false;
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#f6f7f8',
        primaryBorderColor: '#8a949c',
        primaryTextColor: '#12171b',
        lineColor: '#59646e',
        secondaryColor: '#e7eaec',
        tertiaryColor: '#ffffff',
        noteBkgColor: '#fff7e8',
        noteBorderColor: '#d98613',
        fontSize: '13px',
      },
    });
    const nodes = document.querySelectorAll('pre.mermaid');
    if (nodes.length) window.mermaid.run({ nodes });
    return true;
  }
  if (!startMermaid()) window.addEventListener('load', startMermaid);

  /* ---------------------------------------------------------------- outline highlight */
  const outlineLinks = Array.from(document.querySelectorAll('.outline a'));
  if (outlineLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(outlineLinks.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
    const headings = Array.from(byId.keys()).map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          outlineLinks.forEach((a) => a.classList.remove('active'));
          const a = byId.get(e.target.id);
          if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-10% 0px -75% 0px', threshold: 0 });
    headings.forEach((h) => io.observe(h));
  }

  /* ---------------------------------------------------------------- search */
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-results');
  if (!input || !box) return;
  let index = null;
  let loading = null;
  let active = -1;

  function load() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(root + 'assets/search-index.json')
        .then((r) => r.json())
        .then((all) => { index = all[lang] || []; return index; });
    }
    return loading;
  }
  const norm = (s) => s.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en');
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function mark(text, terms) {
    let out = escapeHtml(text);
    terms.forEach((t) => {
      if (!t) return;
      const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function snippet(body, terms) {
    const low = norm(body);
    let pos = -1;
    for (const t of terms) { pos = low.indexOf(t); if (pos >= 0) break; }
    if (pos < 0) return body.slice(0, 140);
    const start = Math.max(0, pos - 60);
    return (start ? '… ' : '') + body.slice(start, start + 160) + ' …';
  }
  function score(entry, terms) {
    const t = norm(entry.t), h = norm(entry.h.join(' ')), d = norm(entry.d || ''), b = norm(entry.b || '');
    let s = 0;
    for (const term of terms) {
      if (!term) continue;
      if (t.includes(term)) s += 10;
      if (h.includes(term)) s += 4;
      if (d.includes(term)) s += 3;
      if (b.includes(term)) s += 1;
      if (!t.includes(term) && !h.includes(term) && !d.includes(term) && !b.includes(term)) return 0;
    }
    return s;
  }
  function render(results, terms) {
    active = -1;
    if (!results.length) {
      box.innerHTML = '<div class="empty">' + escapeHtml(box.dataset.empty || '') + '</div>';
    } else {
      box.innerHTML = results.map((e) =>
        '<a href="' + root + e.u + '"><div class="r-sec">' + escapeHtml(e.s) + '</div>' +
        '<div class="r-title">' + mark(e.t, terms) + '</div>' +
        '<div class="r-snip">' + mark(snippet(e.b || e.d || '', terms), terms) + '</div></a>').join('');
    }
    box.hidden = false;
  }
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    timer = setTimeout(() => {
      load().then((idx) => {
        const terms = norm(q).split(/\s+/).filter(Boolean);
        const results = idx.map((e) => [score(e, terms), e]).filter((p) => p[0] > 0)
          .sort((a, b) => b[0] - a[0]).slice(0, 12).map((p) => p[1]);
        render(results, terms);
      });
    }, 120);
  });
  input.addEventListener('keydown', (ev) => {
    const items = Array.from(box.querySelectorAll('a'));
    if (ev.key === 'Escape') { box.hidden = true; input.blur(); return; }
    if (!items.length || box.hidden) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); active = Math.min(items.length - 1, active + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); active = Math.max(0, active - 1); }
    else if (ev.key === 'Enter' && active >= 0) { ev.preventDefault(); items[active].click(); return; }
    else return;
    items.forEach((a, i) => a.classList.toggle('active', i === active));
    items[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.search')) box.hidden = true; });
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); input.focus(); input.select(); }
  });
})();
