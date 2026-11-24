(() => {
  'use strict';

  const links = [
    ['terms.html', '이용약관'],
    ['privacy.html', '개인정보처리방침'],
    ['contact.html', '문의하기'],
  ];
  const copyright = '© 2026 CINELIQ. All rights reserved.';
  function navigation(label) {
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', label);
    for (const [href, text] of links) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = text;
      if (new URL(href, location.href).pathname === location.pathname)
        link.setAttribute('aria-current', 'page');
      nav.append(link);
    }
    return nav;
  }
  document.querySelectorAll('[data-service-menu]').forEach((root) => {
    const heading = document.createElement('h3');
    heading.textContent = '서비스 안내';
    const small = document.createElement('small');
    small.textContent = copyright;
    root.replaceChildren(heading, navigation('메뉴 서비스 안내'), small);
  });
  document.querySelectorAll('[data-service-footer]').forEach((root) => {
    const inner = document.createElement('div');
    inner.className = 'service-footer-inner';
    const brand = document.createElement('div');
    brand.className = 'service-footer-brand';
    const logo = document.createElement('a');
    logo.href = './';
    logo.className = 'brand-wordmark';
    logo.textContent = 'CINELIQ';
    logo.setAttribute('aria-label', 'CINELIQ 홈');
    const description = document.createElement('p');
    description.textContent = '카메라 기법을 더 쉽고 직관적으로.';
    brand.append(logo, description);
    const small = document.createElement('small');
    small.textContent = copyright;
    inner.append(brand, navigation('푸터 서비스 안내'), small);
    root.replaceChildren(inner);
  });
})();
