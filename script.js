// Theming — default light, persist in localStorage
(function () {
  var STORAGE_KEY = 'portfolio-theme';
  var root = document.documentElement;

  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'light';
    } catch (e) {
      return 'light';
    }
  }

  function setTheme(theme) {
    var value = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {}
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  var initial = getTheme();
  root.setAttribute('data-theme', initial === 'dark' ? 'dark' : 'light');

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    }
  });
})();

// Mobile nav toggle
(function () {
  var toggle = document.getElementById('nav-toggle');
  var topNav = document.querySelector('.top-nav');
  var navLinks = document.getElementById('top-nav-links');
  if (!toggle || !topNav || !navLinks) return;

  function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function closeMenu() {
    topNav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    if (!isMobile()) return;
    var open = topNav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (isMobile()) closeMenu();
    });
  });
})();

// Other Projects accordion (no libraries)
(function () {
  var headers = document.querySelectorAll('.other-header');
  headers.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var panelId = btn.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      btn.setAttribute('aria-expanded', !expanded);
      if (panel) {
        panel.classList.toggle('is-open', !expanded);
      }
    });
  });
})();

// Minimal portfolio interactions
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Load screenshot for slow-loading sites (e.g. CollegeRecon) with delay so page renders first
document.querySelectorAll('.work-card--slow-load[data-screenshot-url]').forEach(function (el) {
  var url = el.getAttribute('data-screenshot-url');
  if (!url) return;
  var apiUrl = 'https://api.microlink.io?url=' + encodeURIComponent(url) + '&screenshot=true&meta=false&waitForTimeout=8000';
  fetch(apiUrl)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var img = data && data.data && data.data.screenshot && data.data.screenshot.url;
      if (img) {
        el.style.setProperty('--thumb', "url('" + img + "')");
      }
    })
    .catch(function () {});
});

// Show older roles (Experience)
(function () {
  var btn = document.getElementById('exp-older-btn');
  var block = document.getElementById('exp-older');
  if (!btn || !block) return;
  btn.addEventListener('click', function () {
    var isHidden = block.hasAttribute('hidden');
    if (isHidden) {
      block.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Show less';
    } else {
      block.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'Earlier experience';
    }
  });
})();

// Skills: Show more chips (max 10 visible, expand on demand)
(function () {
  var cards = document.querySelectorAll('.skill-card');
  var maxVisible = 10;
  cards.forEach(function (card) {
    var container = card.querySelector('.skill-chips');
    if (!container) return;
    var chips = container.querySelectorAll('.chip');
    if (chips.length <= maxVisible) return;
    for (var i = maxVisible; i < chips.length; i++) {
      chips[i].classList.add('skill-chip-hidden');
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'skill-more-btn';
    btn.textContent = 'Show more';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      for (var j = maxVisible; j < chips.length; j++) {
        chips[j].classList.toggle('skill-chip-hidden', expanded);
      }
      btn.setAttribute('aria-expanded', !expanded);
      btn.textContent = expanded ? 'Show more' : 'Show less';
    });
    container.parentNode.appendChild(btn);
  });
})();

// Back to top (visible after 600px scroll)
(function () {
  var btn = document.getElementById('back-to-top');
  if (!btn) return;
  var threshold = 600;
  function update() {
    if (window.scrollY >= threshold) {
      btn.classList.add('is-visible');
    } else {
      btn.classList.remove('is-visible');
    }
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// Contact sidebar: More numbers toggle
(function () {
  var btn = document.getElementById('contact-more-numbers-btn');
  var block = document.getElementById('contact-phone-more');
  if (!btn || !block) return;
  btn.addEventListener('click', function () {
    var expanded = block.getAttribute('hidden') === null;
    if (expanded) {
      block.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'More numbers';
    } else {
      block.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Fewer';
    }
  });
})();

// Sidebar border: end at footer (desktop only)
(function () {
  var sidebar = document.querySelector('.contact-sidebar');
  var footer = document.querySelector('.footer-small');
  if (!sidebar || !footer) return;

  function setBorderHeight() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      sidebar.style.removeProperty('--sidebar-border-height');
      return;
    }
    var navHeight = 48;
    var ft = footer.getBoundingClientRect();
    var height = Math.max(0, Math.round(ft.top - navHeight));
    sidebar.style.setProperty('--sidebar-border-height', height + 'px');
  }

  setBorderHeight();
  window.addEventListener('scroll', setBorderHeight, { passive: true });
  window.addEventListener('resize', setBorderHeight);
})();
