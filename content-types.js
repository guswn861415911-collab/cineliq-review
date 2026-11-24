(() => {
  'use strict';

  window.CINELIQ_CONTENT_TYPES = {
    forItem(item) {
      return { image: item.mediaType === 'image', video: item.mediaType === 'video' };
    },
    matches(item, selected) {
      if (!selected.size) return true;
      const kinds = this.forItem(item);
      return [...selected].some((kind) => kinds[kind]);
    },
  };
})();
