(() => {
  'use strict';

  function createCarouselMarkup(technique, imageRows, renderMedia, escapeHtml) {
    const previewMarkup = renderMedia(technique, imageRows[1], true).replace(
      /alt="[^"]*"/,
      'alt=""',
    );
    let slidesMarkup = '';
    for (let imageIndex = 0; imageIndex < imageRows.length; imageIndex++) {
      const hiddenAttribute = imageIndex === 0 ? '' : 'hidden';
      const imageMarkup = renderMedia(technique, imageRows[imageIndex], true);
      slidesMarkup += `
        <div class="image-stack-slide" role="group" aria-roledescription="슬라이드"
             aria-label="${imageIndex + 1} / ${imageRows.length}" ${hiddenAttribute}>
          ${imageMarkup}
        </div>`;
    }
    return `
      <section class="image-stack" data-image-stack role="region"
               aria-roledescription="이미지 캐러셀"
               aria-label="${escapeHtml(technique.ko)} 예시 이미지" tabindex="0">
        <div class="image-stack-stage">
          <div class="image-stack-back" aria-hidden="true">${previewMarkup}</div>
          <div class="image-stack-frame">${slidesMarkup}</div>
        </div>
        <div class="image-stack-controls">
          <button type="button" data-image-step="-1" aria-label="이전 예시 이미지">‹</button>
          <output role="status" aria-live="polite" aria-atomic="true">1 / ${imageRows.length}</output>
          <button type="button" data-image-step="1" aria-label="다음 예시 이미지">›</button>
        </div>
      </section>`;
  }

  function setupCarousel(carousel) {
    const slides = Array.from(carousel.querySelectorAll('.image-stack-slide'));
    const pageCounter = carousel.querySelector('output');
    const previewCard = carousel.querySelector('.image-stack-back');
    let currentImageIndex = 0;
    let transitionAnimation;
    let touchStartPosition = null;

    function showAdjacentImage(direction) {
      if (transitionAnimation) transitionAnimation.cancel();
      slides[currentImageIndex].hidden = true;
      currentImageIndex = (currentImageIndex + direction + slides.length) % slides.length;
      const currentSlide = slides[currentImageIndex];
      currentSlide.hidden = false;
      pageCounter.textContent = `${currentImageIndex + 1} / ${slides.length}`;
      const nextImageIndex = (currentImageIndex + 1) % slides.length;
      const previewImage = slides[nextImageIndex].querySelector('img').cloneNode(true);
      previewImage.alt = '';
      previewCard.replaceChildren(previewImage);

      const reducedMotion =
        window.CINELIQ_A11Y?.reducedMotion() ||
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) return;
      const startingOffset = direction > 0 ? 7 : -7;
      transitionAnimation = currentSlide.animate(
        [
          { opacity: 0.35, transform: `translateX(${startingOffset}px)` },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { duration: 240, easing: 'ease-out' },
      );
    }

    carousel.addEventListener('click', (event) => {
      const arrowButton = event.target.closest('[data-image-step]');
      if (!arrowButton) return;
      event.stopPropagation();
      showAdjacentImage(Number(arrowButton.dataset.imageStep));
    });
    carousel.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      showAdjacentImage(event.key === 'ArrowLeft' ? -1 : 1);
    });
    carousel.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length !== 1) {
          touchStartPosition = null;
          return;
        }
        touchStartPosition = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      },
      { passive: true },
    );
    carousel.addEventListener(
      'touchcancel',
      () => {
        touchStartPosition = null;
      },
      { passive: true },
    );
    carousel.addEventListener(
      'touchend',
      (event) => {
        const startingPosition = touchStartPosition;
        touchStartPosition = null;
        const endingPosition = event.changedTouches[0];
        if (!startingPosition || !endingPosition || event.touches.length) return;
        const horizontalDistance = startingPosition.x - endingPosition.clientX;
        const verticalDistance = startingPosition.y - endingPosition.clientY;
        const isHorizontalSwipe =
          Math.abs(horizontalDistance) > 55 &&
          Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.6;
        if (!isHorizontalSwipe) return;
        event.stopPropagation();
        showAdjacentImage(horizontalDistance > 0 ? 1 : -1);
      },
      { passive: true },
    );
  }

  function setupImageCarousels(container) {
    const carousels = container.querySelectorAll('[data-image-stack]');
    for (const carousel of carousels) setupCarousel(carousel);
  }

  window.CINELIQ_IMAGE_CAROUSEL = {
    markup: createCarouselMarkup,
    bind: setupImageCarousels,
  };
})();
