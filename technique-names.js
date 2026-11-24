(() => {
  'use strict';

  const overrides = {
    'CAM-039': '룰 오브 서즈',
    'CAM-040': '센터드 컴포지션',
    'CAM-041': '시메트리컬 컴포지션',
    'CAM-042': '에이시메트리컬 컴포지션',
  };
  for (const item of window.CAMERA_TECHNIQUES || []) {
    item.originalKo = item.ko;
    if (overrides[item.id]) item.ko = overrides[item.id];
    item.displaySubtitle =
      item.en + (item.originalKo !== item.ko ? ' · ' + item.originalKo : '');
  }
  window.CINELIQ_NAME_OVERRIDES = overrides;
})();
