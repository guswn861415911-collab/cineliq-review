const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  window = {};
for (const file of [
  'data.js',
  'learning-data.js',
  'production-data.js',
  'terminology-data.js',
])
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window });
const items = window.CAMERA_TECHNIQUES,
  lessons = window.CINELIQ_LEARNING,
  pilots = window.CINELIQ_PRODUCTION.profiles;
const byId = new Map(items.map((item) => [item.id, item]));
const readings = JSON.parse(
  fs.readFileSync(path.join(root, 'content/english-reading.json'), 'utf8'),
);
function englishReading(name) {
  const words =
    name
      .toLowerCase()
      .replace(/'s\b/g, '')
      .match(/[a-z]+|[0-9]+/g) || [];
  for (const word of words) assert.ok(readings[word], 'Missing reading: ' + word);
  return words.map((word) => readings[word]).join(' ');
}
const id = (n) => 'CAM-' + String(n).padStart(3, '0');
const between = (n, a, b) => n >= a && n <= b;
const stillStyles = new Set([
  376, 377, 378, 381, 382, 383, 384, 385, 386, 387, 388, 389, 392, 393, 394,
]);
const imageExceptions = new Set([
  284, 285, 287, 289, 290, 291, 295, 298, 299, 300, 301, 302, 304, 307, 308, 312, 313,
  314, 402, 403, 404,
]);
const temporalComposition = new Set([86, 88, 199, 200, 201, 203, 215, 216, 217]);

const controlGroups = [
  [
    [105, 106],
    'fixed',
    '카메라 위치·방향 고정',
    '고정 삼각대와 안정된 헤드. 손떨림·자동 재구도·노출 변화도 점검합니다.',
  ],
  [
    [107, 108, 155, 156],
    'pan',
    '제자리 수평 회전',
    '팬이 가능한 헤드. 카메라 받침 위치는 그대로 두고 좌우 회전만 합니다.',
  ],
  [
    [109, 110, 157],
    'tilt',
    '제자리 수직 회전',
    '틸트 가능한 헤드. 카메라 전체 높이를 바꾸는 페데스털과 구별합니다.',
  ],
  [
    [111, 112, 311],
    'roll',
    '렌즈 축 주위 롤 회전',
    '롤 회전을 제어할 수 있는 헤드·리그 또는 후반 회전. 실제 촬영과 디지털 회전을 구별합니다.',
  ],
  [
    [113, 114, 115, 116, 149, 150, 151, 158, 159],
    'dolly',
    '실제 전후 이동',
    '돌리·레일·슬라이더·안정화 이동 중 경로에 맞는 방식을 고릅니다. 이동 공간과 초점 거리를 확보합니다.',
  ],
  [
    [117, 118, 119, 130, 188],
    'truck',
    '실제 좌우 이동',
    '레일·슬라이더 등 수평 경로를 유지하는 지지 방식. 렌즈 방향을 좌우로 돌리는 팬과 다릅니다.',
  ],
  [
    [120, 121],
    'pedestal',
    '카메라 전체 높이 이동',
    '높이 이동이 가능한 지지대·붐 등. 바라보는 방향과 카메라 높이의 변화를 구별합니다.',
  ],
  [
    [122, 123, 152, 153, 154],
    'zoom',
    '렌즈 화각 조작',
    '줌 렌즈 또는 의도한 디지털 확대 방식. 카메라 위치를 고정하고 초점·화각 변화를 확인합니다.',
  ],
  [
    [124, 125, 126, 127, 128, 129, 131, 147, 148],
    'tracking',
    '피사체와 함께 이동',
    '짐벌·돌리·안정화 장비 중 동선에 맞게 선택합니다. 피사체 속도와 카메라 속도·간격을 따로 계획합니다.',
  ],
  [
    [132, 133, 134, 135, 136, 137, 145, 180],
    'orbit',
    '대상 주위를 도는 경로 이동',
    '원호를 확보할 수 있는 지지·이동 장비. 대상이 제자리에서 도는 것과 카메라 궤도 이동을 구별합니다.',
  ],
  [
    [160, 161, 162, 163, 165, 167, 168, 187],
    'handheld',
    '손 지지·의도된 흔들림',
    '손 지지와 리그·안정화 선택. 충격의 크기와 지속 시간을 미리 정하고 인물이 읽히는지 확인합니다.',
  ],
  [
    [169, 170, 171, 172, 173, 174, 175],
    'crane',
    '팔·붐 경로의 공간 이동',
    '크레인·지브·붐 등 해당 장비와 숙련된 운용자. 하중·스윙 구역을 확보하며 입문자가 위험한 설치를 모방하지 않습니다.',
  ],
  [
    [176, 177, 178, 179, 181, 182, 183, 184],
    'aerial',
    '공중 시점·비행 경로',
    '합법적인 비행 환경과 자격·안전 통제가 전제입니다. 생성 영상의 예시는 실제 비행 허가나 안전 경로를 보증하지 않습니다.',
  ],
  [
    [185, 186, 164, 166],
    'stabilized',
    '안정화된 이동',
    '짐벌·스테디캠 등 목적에 맞는 안정화 방식. 장비명은 특정 이동 경로 하나를 뜻하지 않습니다.',
  ],
  [
    [189],
    'cable',
    '케이블 경로 이동',
    '전문가가 설치·검수한 케이블 시스템. 보행자 위 임의 설치를 권하지 않습니다.',
  ],
  [
    [190, 191],
    'vehicle',
    '차량과 함께 움직이는 고정 시점',
    '전문 차량 리그·안전 운용. 운전 중 촬영 조작이나 임의 부착을 권하지 않습니다.',
  ],
  [
    [192, 193, 305, 306],
    'repeatable',
    '제어·반복 카메라 이동',
    '로봇 암·모션 컨트롤과 경로 기록. 실제 반복 정밀도는 장비·설정·후반 정합으로 확인합니다.',
  ],
  [
    [194, 103, 104],
    'mounted',
    '몸에 부착된 시점',
    '몸 부착 리그와 안전한 지지. 사람에 대한 카메라 위치가 고정되어도 배경은 상대적으로 움직일 수 있습니다.',
  ],
  [
    [199, 200, 201, 202, 203, 215, 332],
    'focus',
    '초점 조작',
    '렌즈 초점 조절과 필요 시 포커스 제어 장치. 초점 거리 조절과 렌즈 초점거리(화각)를 혼동하지 않습니다.',
  ],
  [
    [216, 217],
    'dolly-zoom',
    '실제 이동과 반대 줌 조합',
    '이동 경로와 줌·초점 조절의 동기화. 인물 크기와 배경 관계를 나누어 검수합니다.',
  ],
];
const controls = new Map(
  controlGroups.flatMap(([numbers, kind, label, equipment]) =>
    numbers.map((n) => [n, { kind, label, equipment }]),
  ),
);
for (const n of [287, 289, 291, 295, 298, 299, 300, 304])
  controls.set(n, {
    kind: 'fixed',
    label: '고정 시점의 대상·특수 기록',
    equipment: lessons[id(n)].shootingMethod,
  });
for (const n of [284, 285, 286, 288, 292, 296])
  controls.set(n, {
    kind: 'tracking',
    label: '개별 시점에서 피사체 추적',
    equipment: lessons[id(n)].shootingMethod,
  });
controls.set(293, {
  kind: 'truck',
  label: '반사 각도를 바꾸는 실제 옆 이동',
  equipment: lessons[id(293)].shootingMethod,
});
for (const n of [301, 302])
  controls.set(n, {
    kind: 'viewer',
    label: '관객의 시청 방향 변화 · 일반 영상 프리비즈',
    equipment: lessons[id(n)].shootingMethod,
  });
for (const n of [218, 219, 309, 312, 313, 314])
  controls.set(n, {
    kind: 'post',
    label: n === 309 ? '고속 기록·재생 속도 구분' : '확대·회전·화면 변형의 후반 예시',
    equipment: lessons[id(n)].shootingMethod,
  });
controls.set(310, {
  kind: 'style',
  label: '고정 카메라의 프레임별 물체 조작',
  equipment: lessons[id(310)].shootingMethod,
});
const phaseOverrides = {
  218: {
    start: '같은 위치에서 찍은 원본 영상 전체를 보여 줍니다.',
    change:
      '카메라와 렌즈를 움직이지 않고 원본 프레임 일부를 디지털로 잘라 확대합니다. 확대할수록 원본 픽셀의 세부 한계가 드러납니다.',
    end: '선택한 확대 범위와 원본의 공간 관계를 유지합니다.',
  },
  219: {
    start: '인물의 상체가 보이는 하나의 고해상도 원본 샷입니다.',
    change:
      '같은 원본의 얼굴 부분을 선택해 가까운 크기로 한 번 컷합니다. 광학 줌이나 카메라 접근을 추가하지 않습니다.',
    end: '선택한 얼굴 크기에서 원래 인물의 행동을 이어 보여 줍니다.',
  },
  220: {
    start: '카메라를 삼각대에 고정해 중앙의 밝은 물체를 봅니다.',
    change:
      '긴 노출 동안 줌을 바꾸어 물체에서 방사형으로 번진 하나의 줌 버스트 사진 결과를 보여 줍니다.',
    end: '그 방사형 흔적이 보이는 정지 사진을 유지합니다. 연속 줌 영상과 장노출 사진의 흔적을 혼동하지 않습니다.',
  },
};
const exceptions = {
  301: '360도 영상의 구면 투영·스티칭·인터랙티브 재생은 일반 16:9 생성 영상으로 입증할 수 없습니다. 예시는 시야 변화의 프리비즈이며 실제 360 원본은 전용 촬영·후반 경로가 필요합니다.',
  302: 'VR의 양안 입체·머리 추적·공간 투영은 일반 16:9 생성 예시와 다릅니다. 시점 연출만 참고하고 실제 VR 출력은 별도로 제작합니다.',
  298: '보이는 열화상 색은 연출 예시이며 실제 온도 측정·방사율 데이터가 아닙니다. 측정에는 보정된 열화상 장비가 필요합니다.',
  299: 'AI가 만든 적외선풍 색감은 실제 적외선 파장 기록의 증거가 아닙니다. 실제 촬영은 센서·필터·광원 조건을 확인합니다.',
  300: '생성한 야간투시풍 화면은 실제 장비의 저조도 성능을 검증하지 않습니다.',
  193: '동일 경로의 픽셀 단위 반복은 텍스트 생성만으로 보장되지 않습니다. 실제 장비 경로와 후반 정합으로 검증합니다.',
  305: '반복 테이크의 정확한 경로 일치는 생성 예시만으로 보증하지 않습니다. 실제 카메라·초점·조명 기록이 필요합니다.',
  306: '반복 촬영 합성은 별도 테이크·정합·마스크가 필요한 실무입니다. 생성 예시는 완성된 합성 인상만 보여주며 레이어나 알파를 제공하지 않습니다.',
  309: '느리게 보이는 생성 영상은 실제 고속 촬영 원본과 다릅니다. 촬영 FPS와 재생 FPS는 장비·파일에서 따로 확인합니다.',
  395: '생성 영상의 느린 움직임을 높은 촬영 FPS의 증거로 사용하지 않습니다. 속도 변환은 원본 프레임과 보간 품질을 별도로 확인합니다.',
  403: '생성된 완성 화면만으로 실제 크로마키·정확한 알파 매트를 제공할 수 없습니다. 배경 제거·머리카락 경계·스필은 후반 합성에서 확인합니다.',
  404: '자동 생성 외형은 프레임별 마스크 작업과 같지 않습니다. 실제 로토스코핑은 원본과 분리 매트를 별도로 검수합니다.',
  390: '로토스코프풍 생성물과 원본 동작을 실제로 트레이싱한 제작 공정을 구별합니다.',
};
const comparePairs = [
  [
    105,
    106,
    '고정된 화면을 유지합니다.',
    'Static은 움직임 없는 샷을 넓게 부르는 말이고 Locked-Off는 위치·방향을 잠가 반복 가능한 고정을 강조합니다. 용례가 겹치므로 별개의 강제 규격으로 나누지 않습니다.',
  ],
  [
    107,
    117,
    '왼쪽 공간이 새로 보일 수 있습니다.',
    'Pan Left는 제자리에서 왼쪽 회전, Truck Left는 카메라 위치의 왼쪽 이동입니다. 전경·배경의 상대 겹침 변화와 회전 중심을 확인합니다.',
  ],
  [
    108,
    118,
    '오른쪽 공간이 드러날 수 있습니다.',
    'Pan Right는 제자리 회전이고 Truck Right는 위치 이동입니다. 화면이 옆으로 흐른다는 사실만으로 같은 움직임이라고 판단하지 않습니다.',
  ],
  [
    109,
    120,
    '더 높은 부분을 보여줄 수 있습니다.',
    'Tilt Up은 고정 위치에서 위로 보는 회전, Pedestal Up은 카메라 전체 높이 상승입니다. 대상 윗면·가림 관계와 카메라 높이를 함께 봅니다.',
  ],
  [
    110,
    121,
    '더 낮은 부분이 드러날 수 있습니다.',
    'Tilt Down은 아래로 기울이는 회전, Pedestal Down은 위치의 하강입니다. 내려다보는 방향 변화와 실제 높이 변화를 분리합니다.',
  ],
  [
    113,
    122,
    '대상이 점점 크게 보일 수 있습니다.',
    'Dolly In은 실제 접근으로 원근·가림 관계가 바뀌고 Zoom In은 위치를 유지한 화각 변화입니다. 대상 크기만 비교하지 않습니다.',
  ],
  [
    114,
    123,
    '대상이 작아지고 주변이 넓어질 수 있습니다.',
    'Dolly Out은 실제 후퇴, Zoom Out은 제자리에서 화각을 넓히는 렌즈 조작입니다. 가까운 물체와 먼 배경의 상대 변화를 봅니다.',
  ],
  [
    124,
    125,
    '움직이는 피사체와 함께 진행합니다.',
    'Tracking은 대상과 함께 이동하는 넓은 표현이고 Follow는 따라가는 관계를 강조합니다. 현장에 따라 겹치며 반드시 서로 다른 장비나 방향을 뜻하지 않습니다.',
  ],
  [
    133,
    132,
    '대상 주변의 곡선 경로로 다른 면을 보여줍니다.',
    'Orbit은 중심 대상을 도는 관계, Arc는 원호 일부의 경로를 강조합니다. 완전한 한 바퀴가 모든 Orbit의 필수 조건은 아니며 두 용어는 겹칠 수 있습니다.',
  ],
  [
    187,
    168,
    '손 지지의 살아 있는 움직임을 사용할 수 있습니다.',
    'Handheld는 지지 방식이며 Shaky Cam은 흔들림이 두드러지는 표현입니다. 손 촬영이라고 항상 크게 흔들 필요는 없습니다.',
  ],
];
const strictNames = new Map();
for (const item of items) {
  const key = item.en.toLowerCase().replace(/[^a-z0-9]/g, '');
  strictNames.set(key, [...(strictNames.get(key) || []), item.id]);
}
const duplicateGroups = [...strictNames.values()].filter((group) => group.length > 1);
const overlapKeys = new Set();
for (const [source, lesson] of Object.entries(lessons))
  for (const [target, difference] of Object.entries(lesson.relatedTechniqueDifferences))
    if (difference.startsWith('동의어이거나 용례가 겹치는'))
      overlapKeys.add([source, target].sort().join(':'));
const contextualOverlapPairs = [...overlapKeys].sort().map((key) => ({
  ids: key.split(':'),
  relation: '동의어 또는 문맥상 용례 겹침 · 강제 병합하지 않음',
}));
function parsePhases(prompt) {
  if (!prompt) return null;
  const match = prompt.match(
    /0~2초:\s*([\s\S]*?)\n2~6초:\s*([\s\S]*?)\n6~8초:\s*([^\n]+)/,
  );
  return match
    ? { start: match[1].trim(), change: match[2].trim(), end: match[3].trim() }
    : null;
}
function controlFor(item) {
  if (controls.has(item.number)) return controls.get(item.number);
  if (item.major === 'cut' || item.major === 'post')
    return {
      kind: 'post',
      label: '편집·후반 처리',
      equipment:
        '원본 샷과 영상 편집·합성 도구. 프레임·소리·마스크의 정확한 시점은 타임라인에서 조절합니다.',
    };
  if (item.major === 'movement')
    return {
      kind: 'special',
      label: '개별 경로·촬영 방식',
      equipment: lessons[item.id].shootingMethod,
    };
  if (item.major === 'lighting')
    return {
      kind: 'lighting',
      label: '조명 배치·유지',
      equipment:
        '목적에 맞는 광원·반사판·차광과 안전한 지지. ' + lessons[item.id].shootingMethod,
    };
  if (item.major === 'effects')
    return {
      kind: 'optical',
      label: '광학·화면 표현',
      equipment: lessons[item.id].shootingMethod,
    };
  if (item.major === 'styles')
    return {
      kind: 'style',
      label: '재료·화풍·애니메이션 제작',
      equipment: lessons[item.id].shootingMethod,
    };
  return {
    kind: 'framing',
    label: '구도·피사체 배치',
    equipment: lessons[item.id].shootingMethod,
  };
}
const records = {},
  ledger = [];
for (const item of items) {
  const lesson = lessons[item.id],
    pilot = pilots[item.id],
    n = item.number,
    control = controlFor(item);
  const videoRequired = !stillStyles.has(n);
  const imageApplicable =
    (!['movement', 'cut', 'post'].includes(item.major) && !temporalComposition.has(n)) ||
    imageExceptions.has(n);
  const scene = lesson.practicalExamples[0];
  const phases = phaseOverrides[n] ||
    parsePhases(lesson.videoPromptExample) || {
      start:
        '카메라는 아래 구도의 위치·높이·방향을 잡고 고정합니다. ' +
        lesson.visualCharacteristics[0] +
        '.',
      change:
        scene +
        ' 카메라는 따라가거나 줌하지 않고, 피사체가 이 구도의 범위 안에서만 행동합니다.',
      end:
        lesson.visualCharacteristics.slice(1).join('. ') +
        '. 시작 때의 카메라 위치·방향과 배경 구조를 유지하며 행동을 마칩니다.',
    };
  const cameraAction = ['framing', 'lighting', 'optical'].includes(control.kind)
    ? '필수 카메라 이동 없음. 위치·높이·방향과 화각을 고정한 예시로 구성합니다.'
    : control.kind === 'post'
      ? '촬영된 원본과 후반 처리의 변화입니다. 화면 전환을 실제 카메라 이동이라고 설명하지 않습니다.'
      : control.label + '을 아래 시간 단계에 따라 구현합니다.';
  const subjectAction =
    control.kind === 'focus'
      ? '초점의 변화와 피사체의 이동을 아래 단계대로 구별합니다. 초점 조작을 카메라 이동이나 줌으로 바꾸지 않습니다.'
      : control.kind === 'orbit'
        ? '중심 피사체는 위치를 유지하고 카메라가 그 주위를 이동합니다. 피사체의 제자리 회전만으로 궤도 이동을 대신하지 않습니다.'
        : ['post', 'zoom', 'roll', 'pan', 'tilt'].includes(control.kind)
          ? '기법을 판별하는 동안 피사체의 위치와 형태를 안정적으로 유지하고, 변화는 아래 단계의 지정 요소에 한정합니다.'
          : scene;
  const direction = [
    'framing',
    'lighting',
    'optical',
    'style',
    'post',
    'fixed',
    'focus',
    'zoom',
  ].includes(control.kind)
    ? null
    : phases.change;
  const speed = [
    'framing',
    'lighting',
    'optical',
    'style',
    'post',
    'fixed',
    'focus',
  ].includes(control.kind)
    ? null
    : /빠르|급|순간|휙/.test(phases.change)
      ? '짧고 빠른 변화 뒤 끝 구도에서 정지합니다.'
      : /불규칙|흔들/.test(phases.change)
        ? '방향과 흔들림의 폭을 제한하고 피사체 식별을 우선합니다.'
        : '변화 구간을 천천히 이어가고 끝에서 부드럽게 멈춥니다.';
  const related = lesson.relatedTechniqueIds;
  const issueSpecific = {
    problem: lesson.shootingTips,
    check: lesson.visualCharacteristics,
    retry:
      '잘못된 결과에서는 다음 핵심 조건 중 사라진 항목을 먼저 고칩니다: ' +
      lesson.visualCharacteristics.join(' / ') +
      '. ' +
      lesson.shootingTips,
  };
  const editing = {
    use: lesson.practicalExamples[1],
    rhythm:
      lesson.directingEffects +
      '을 의도하는 장면에서 변화 또는 반응을 읽을 시간을 확보합니다.',
    connection: related.map((target) => ({
      id: target,
      difference: lesson.relatedTechniqueDifferences[target],
    })),
    continuity:
      item.major === 'cut' || item.major === 'post' ? phases.change : lesson.shootingTips,
    generationFix: issueSpecific.retry,
    postFix:
      control.kind === 'post'
        ? '정확한 전환·속도·정지·음향 연결은 편집 타임라인에서 시작·끝 프레임을 맞춥니다. ' +
          phases.change
        : '컷 길이·시선 연결·작은 노출 차이는 편집에서 조절할 수 있습니다. ' +
          lesson.shootingTips +
          ' 핵심 구도·원근·대상 형태가 이미 잘못되었다면 단순 속도·색 수정으로 복구했다고 보지 않습니다.',
  };
  const limitation =
    exceptions[n] ||
    (item.major === 'cut' || item.major === 'post'
      ? '정확한 프레임·속도·레이어·음향 연결을 요구하는 완성 작업은 영상 편집 도구에서 확인합니다. 생성물은 결과의 시각적 예시이며 편집 프로젝트나 원본 레이어를 대신하지 않습니다.'
      : item.major === 'styles'
        ? '화풍·질감의 시각적 참고이며 특정 재료로 실제 제작한 사실을 증명하지 않습니다.'
        : null);
  const appearance =
    /(인물|남성|여성|작업자|진행자|주인공)/.test(scene) &&
    !/(\d+대|아이|어린|학생|소년|가족|두 사람|군중|여러)/.test(scene)
      ? '성인 주인공은 30대 한국인으로 단정한 검은 머리이며, 장면에 적힌 의상과 소품을 그대로 유지한다. '
      : '';
  const originalVideo = lesson.videoPromptExample || pilot?.videoPrompt || null;
  const videoPrompt = videoRequired
    ? `가로 16:9, 8초의 ${item.major === 'styles' ? '지정 화풍을 유지하는 애니메이션' : '사실적인 시네마틱 학습 영상'}. ${item.ko} / ${item.en}의 특징을 명확히 보여준다.\n\n장면: ${appearance}${scene}\n\n시작 0~2초: ${phases.start}\n변화 2~6초: ${phases.change}\n종료 6~8초: ${phases.end}\n\n카메라와 피사체: ${cameraAction} ${subjectAction}\n${speed ? '속도: ' + speed + '\n' : ''}유지할 시각 기준: ${lesson.visualCharacteristics.join('. ')}.\n${item.major === 'lighting' ? '장면의 조명 배치와 그림자 관계를 유지한다.' : item.major === 'effects' ? '지정한 광학·색감 표현은 유지하고 다른 효과로 바꾸지 않는다.' : item.major === 'styles' ? '같은 재료·윤곽·색면과 캐릭터 비율을 유지한다.' : '장면에 명시된 빛과 색감을 유지하고 명시되지 않은 시간대 변화는 넣지 않는다.'} 인물·소품·배경 구조의 연속성을 유지한다.\n잘못된 구현을 피할 조건: ${lesson.shootingTips}\n명시한 동작·전환 외의 추가 카메라 이동·줌·회전·컷은 넣지 않는다. 자막·로고·워터마크와 지시하지 않은 추가 인물은 없다.`
    : null;
  const omission = videoRequired
    ? null
    : `${item.ko}의 핵심은 ${lesson.visualCharacteristics.join(' / ')}입니다. 이 항목에서는 정지 화면의 재료·형태·배치 비교로 충분히 설명할 수 있어 새 움직임을 억지로 추가하지 않습니다. 실제 영상에서 이 표현을 사용할 수 없다는 뜻은 아닙니다.`;
  const terms = window.CINELIQ_TERMINOLOGY.terms.filter((term) =>
    (term.primaryTechniqueIds || term.techniqueIds).includes(item.id),
  );
  const reading = pilot?.pronunciation || englishReading(item.en);
  const record = {
    id: item.id,
    imageApplicable,
    videoApplicable: videoRequired,
    imageGuide: {
      setup: lesson.shootingMethod,
      visualChecks: lesson.visualCharacteristics,
      scene,
      pitfall: lesson.shootingTips,
      promptAvailable: !!lesson.imagePromptExample,
    },
    videoGuide: videoRequired
      ? {
          definition: item.summary,
          beginnerExplanation: lesson.beginnerExplanation,
          reading,
          readingKind: '영문명 국문 읽기 · 학습용 근사 표기',
          abbreviations: terms
            .filter((term) => term.abbreviation)
            .map((term) => term.abbreviation),
          aliases: terms.flatMap((term) => term.aliases),
          control,
          cameraAction,
          subjectAction,
          direction,
          speed,
          start: phases.start,
          change: phases.change,
          end: phases.end,
          visualChecks: lesson.visualCharacteristics,
          effect: lesson.directingEffects,
          situations: lesson.practicalExamples,
          issues: issueSpecific,
          editing,
          limitation,
          veoKoreanPrompt: videoPrompt,
        }
      : null,
    videoOmissionReason: omission,
    comparisonIds: related,
    originalVideoAvailable: !!originalVideo,
  };
  records[item.id] = record;
  ledger.push({
    id: item.id,
    en: item.en,
    ko: item.ko,
    major: item.major,
    registeredMediaType: item.mediaType,
    imageApplicable,
    videoApplicable: videoRequired,
    imageGuide: 'written',
    imageGuideFormat: imageApplicable ? 'single-frame' : 'storyboard-or-stage-comparison',
    videoGuide: videoRequired ? 'written' : 'not-required',
    videoOmissionReason: omission,
    imagePrompt: true,
    originalVideoPrompt: !!originalVideo,
    additionalVideoPrompt: !!videoPrompt,
    previouslyMissingVideoPrompt: !originalVideo && videoRequired,
    aiIssueReview: videoRequired ? 'written' : 'image-pitfall-written',
    similarTechniques: true,
    contentAccuracy: {
      schemaAndMotionRules: 'pending',
      independentExpertReview: 'not-performed',
      veoExecution: 'not-performed',
      koreanNativeSupport: 'not-confirmed',
    },
    siteDisplay: 'pending',
    batch: Math.floor((n - 1) / 24) + 1,
  });
}
const counts = {
  registeredUniqueIds: items.length,
  normalizedEnglishNames: strictNames.size,
  registeredImageMedia: items.filter((i) => i.mediaType === 'image').length,
  registeredVideoMedia: items.filter((i) => i.mediaType === 'video').length,
  imageApplicable: ledger.filter((i) => i.imageApplicable).length,
  videoApplicable: ledger.filter((i) => i.videoApplicable).length,
  commonApplicable: ledger.filter((i) => i.imageApplicable && i.videoApplicable).length,
  imageGuides: ledger.length,
  videoGuides: ledger.filter((i) => i.videoGuide === 'written').length,
  videoOmissions: ledger.filter((i) => i.videoGuide === 'not-required').length,
  previousVideoPrompts: ledger.filter((i) => i.originalVideoPrompt).length,
  newlyCoveredVideoPrompts: ledger.filter((i) => i.previouslyMissingVideoPrompt).length,
};
assert.equal(counts.previousVideoPrompts, 223);
assert.equal(counts.registeredUniqueIds, 414);
assert.equal(
  counts.imageApplicable + counts.videoApplicable - counts.commonApplicable,
  414,
);
const payload = {
  version: 1,
  model: {
    name: 'Google Veo 3.1 Lite',
    durationSeconds: 8,
    aspectRatio: '16:9',
    language: 'ko',
    executionVerified: false,
    notice:
      '한국어로 작성한 학습용 완성형 예시입니다. 공식 모델 사양의 프롬프트 언어는 영어이며, 한국어 입력의 공식 지원·정확한 구현·실제 생성 성공은 미검증입니다.',
    sources: [
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate',
      'https://deepmind.google/models/veo/prompt-guide/',
    ],
  },
  counts,
  comparisons: comparePairs.map(([a, b, common, difference]) => ({
    ids: [id(a), id(b)],
    common,
    difference,
    check: records[id(a)].videoGuide.visualChecks.concat(
      records[id(b)].videoGuide.visualChecks,
    ),
    ai: '각 방법의 카메라 동작을 따로 지정합니다. ' + difference,
  })),
  records,
};
fs.writeFileSync(
  path.join(root, 'full-learning-data.js'),
  'window.CINELIQ_FULL_LEARNING = ' + JSON.stringify(payload, null, 2) + ';\n',
);
fs.writeFileSync(
  path.join(root, 'content/learning-status.json'),
  JSON.stringify(
    {
      version: 1,
      counts,
      classificationPolicy:
        'imageApplicable는 단독 정지 화면으로 핵심을 판별할 수 있는 학습 항목, videoApplicable은 시간 변화 또는 영상 속 구도 유지 예시가 필요한 항목입니다. 기존 mediaType은 대표 미디어 유형일 뿐 적용 가능성 분류가 아닙니다. 영상 미작성 15개는 화풍 정지 비교로 충분하다는 편집 판단이며 영상 사용 불가를 뜻하지 않습니다.',
      duplicateGroups,
      contextualOverlapPairs,
      items: ledger,
    },
    null,
    2,
  ) + '\n',
);
const csvCell = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const csvRows = [
  [
    'ID',
    '영문명',
    '한국어명',
    '기존미디어',
    '정지화면판별',
    '영상학습필요',
    '기존영상프롬프트',
    '영상신규보완',
    '배치',
  ],
  ...ledger.map((row) => [
    row.id,
    row.en,
    row.ko,
    row.registeredMediaType,
    row.imageApplicable,
    row.videoApplicable,
    row.originalVideoPrompt,
    row.previouslyMissingVideoPrompt,
    row.batch,
  ]),
];
fs.writeFileSync(
  path.join(root, 'content/technique-inventory.csv'),
  '\uFEFF' + csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n',
);
console.log(counts);
