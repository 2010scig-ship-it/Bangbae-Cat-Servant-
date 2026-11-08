'use strict';
// ===== 게임 설정값: 밸런스는 여기서만 조정 =====
const CFG = {
  DAY_REAL_SEC: 600,          // 게임 속 하루 = 실제 10분
  START_MINUTE: 8 * 60,       // 아침 8시 시작
  ROOM_H: 420,                // 방 높이(월드 단위). 화면에 맞춰 resize()에서 바뀜
  WALL_H: 250,
  FLOOR_Y0: 272,              // 가장 안쪽 바닥(z=0)의 발 위치
  FLOOR_DEPTH: 128,           // z=1(화면 앞)까지 깊이. 세로 화면에서는 더 깊어짐
  BASE_DEPTH: 128, MAX_DEPTH: 600,
  DEPTH_K: 0.3, DEPTH_BASE: 0.84,   // 안쪽 크기와 앞쪽으로 갈수록 커지는 정도
  MIN_SCALE: 0.42,            // 방 전체를 맞추되 이보다 작아지면 좌우로 넘겨 봄
  BASE_W: 720,                // 고양이 1마리일 때 방 폭
  W_PER_CAT: 90,              // 고양이가 늘 때마다 넓어지는 폭
  WINDOW_X: 330,
  START_COINS: 30,
  MAX_CATS: 5,
  STRAY_DAYS: [5, 12, 20, 30],
  STRAY_BOND: [15, 25, 35, 45],
  FPS: 30,
  BOWL_PER_CAT: 2,
  PET_REWARD_COOLDOWN_MIN: 60,
  PLAY_REWARD: 3, PLAY_DAILY: 3,
  DAILY_BONUS: 10,
  LITTER_HESITATE_CLUMPS: 3,
};

// 시간당 수치 변화(게임 속 1시간 기준)
const RATES = {
  hunger: -5, comfort: -6, happy: -1.5,
  energyAwake: -3, energyActive: -12, energySleep: +14,
};

const COATS = {
  cheese:   { name: '치즈',       base: '#f6b366', dark: '#e08736', belly: '#fff1d8', pattern: 'tabby', line: '#b86a2e', muzzle: '#fff6e6' },
  mackerel: { name: '고등어',     base: '#aba291', dark: '#57503f', belly: '#f1ece3', pattern: 'tabby', line: '#5b5246', muzzle: '#f6f2eb' },
  black:    { name: '검은 고양이', base: '#2f2b35', dark: '#1b181f', belly: '#2f2b35', pattern: 'solid', line: '#121014', face: '#d9d0e2', whisker: 'rgba(230,225,240,0.6)', earIn: '#b9788a' },
  white:    { name: '흰 고양이',   base: '#fdfbf7', dark: '#e6dfd5', belly: '#ffffff', pattern: 'solid', line: '#b3a698', earIn: '#f8b2c2' },
  calico:   { name: '삼색이',     base: '#fdf9f2', dark: '#5d4536', patch: '#f2a24e', belly: '#ffffff', pattern: 'calico', line: '#9b7f66' },
  tuxedo:   { name: '턱시도',     base: '#2b2830', dark: '#17151b', belly: '#fffdf9', pattern: 'tuxedo', line: '#121014', eyeLine: '#e6dde8', whisker: 'rgba(150,140,150,0.65)', earIn: '#c4808f' },
  gray:     { name: '회색',       base: '#9ba6b5', dark: '#76828f', belly: '#c6ced8', pattern: 'solid', line: '#5d6776', muzzle: '#d8dee5' },
};

const EYES = {
  yellow: { name: '노랑', c: '#f3c22c' },
  green:  { name: '초록', c: '#7bc35a' },
  blue:   { name: '파랑', c: '#5aa9e8' },
};

const PERS = {
  dog:    { name: '개냥이', desc: '주인을 정말 좋아해서 자주 다가와요', approach: 3.0, play: 1.0, hungerRate: 1.0, bondMul: 1.0 },
  tsun:   { name: '새침이', desc: '가끔만 다가오지만, 쓰다듬으면 친밀도가 더 올라요', approach: 0.4, play: 1.0, hungerRate: 1.0, bondMul: 1.6 },
  zoom:   { name: '우다다', desc: '캣휠과 놀이를 정말 좋아해요', approach: 1.0, play: 2.5, hungerRate: 1.1, bondMul: 1.0 },
  foodie: { name: '먹보',   desc: '금방 배고파지고 밥그릇 앞에서 졸라요', approach: 1.2, play: 0.8, hungerRate: 1.45, bondMul: 1.0 },
};

const SNACKS = {
  churu:   { name: '츄르',     icon: '🍬', price: 5, limit: 2, hunger: 6,  happy: 25, bond: 1.5, how: '손을 끌어 고양이 입에 대면 짜서 줘요' },
  bugeo:   { name: '북어트릿', icon: '🐟', price: 3, limit: 3, hunger: 8,  happy: 12, bond: 0.5, how: '손을 끌어 고양이 입에 대 주세요' },
  chicken: { name: '닭가슴살', icon: '🍗', price: 4, limit: 2, hunger: 25, happy: 12, bond: 0.5, how: '손을 끌어 고양이 입에 대 주세요' },
  tuna:    { name: '참치 츄르', icon: '🍥', price: 12, limit: 1, hunger: 10, happy: 35, bond: 3, premium: true, how: '고급 간식 · 친밀도가 크게 올라요' },
  salmon:  { name: '연어 큐브', icon: '🍣', price: 10, limit: 1, hunger: 20, happy: 20, bond: 2, premium: true, how: '고급 간식 · 배도 든든해요' },
  catnip:  { name: '캣잎',     icon: '🌿', price: 8, limit: 1, hunger: 0,  happy: 30, bond: 0.5, how: '바닥을 탭해서 뿌려요 (하루 1번)' },
};

// 상점 아이템: day/bond 조건을 채우면 진열, 코인으로 구매
const ITEMS = {
  laser:    { name: '레이저 포인터',   icon: '🔴', day: 3,  bond: 10, price: 20,  kind: 'tool',  desc: '손가락으로 빨간 점을 움직여요' },
  hideout:  { name: '숨숨집',         icon: '🛖', day: 7,  bond: 20, price: 40,  kind: 'floor', desc: '쏙 들어가 숨어서 자요' },
  tunnel:   { name: '바스락 터널',     icon: '🌀', day: 7,  bond: 20, price: 40,  kind: 'floor', desc: '바스락바스락 통과해요' },
  mouse:    { name: '태엽 쥐 인형',    icon: '🐭', day: 10, bond: 25, price: 60,  kind: 'floor', desc: '혼자 돌아다녀서 쫓아가요' },
  tower:    { name: '캣타워',         icon: '🗼', day: 15, bond: 35, price: 120, kind: 'floor', desc: '높은 곳에서 내려다봐요' },
  hammock:  { name: '창가 해먹',       icon: '🪟', day: 20, bond: 40, price: 150, kind: 'wall',  desc: '창밖 새를 구경해요' },
  litter2:  { name: '화장실 추가',     icon: '🚽', day: 25, bond: 45, price: 80,  kind: 'floor', desc: '화장실이 하나 더 생겨요' },
  ledwheel: { name: 'LED 고급 캣휠',   icon: '🌈', day: 30, bond: 55, price: 250, kind: 'upgrade', desc: '반짝반짝 빛나는 캣휠' },
  feather:  { name: '자동 깃털 장난감', icon: '🪶', day: 30, bond: 55, price: 200, kind: 'floor', desc: '혼자 살랑살랑 움직여요' },
  bigtower: { name: '대형 캣타워',     icon: '🏰', day: 40, bond: 70, price: 400, kind: 'floor', desc: '천장까지 닿는 꿈의 캣타워' },
};

// 시간 속도: 게임 속 하루가 실제 몇 분인지
const SPEEDS = [
  { k: 0.5, name: '느긋하게', desc: '하루 20분' },
  { k: 1,   name: '보통',     desc: '하루 10분' },
  { k: 2,   name: '빠르게',   desc: '하루 5분' },
  { k: 4,   name: '아주 빠르게', desc: '하루 2분 30초' },
];

// 고양이가 먼저 하는 부탁 (게임 속 분 단위)
const REQ = {
  INTERVAL: [40, 110], DURATION: 180,
  REWARD_COINS: 2, REWARD_BOND: 1.5, REWARD_HAPPY: 10, MISS_HAPPY: 5,
};
const REQUESTS = {
  play:  { icon: '🎣', text: '놀아줘!',   hint: '🧶 장난감에서 낚싯대나 레이저로 놀아주세요' },
  pet:   { icon: '💗', text: '쓰다듬어줘', hint: '고양이 위를 손가락으로 문질러 주세요' },
  snack: { icon: '🍬', text: '간식 줘!',   hint: '🍬 간식을 골라 손을 고양이 입에 대 주세요' },
  brush: { icon: '✨', text: '빗질해줘',   hint: '🧶 장난감 → 빗을 고르고 고양이를 문질러 주세요' },
  gift:  { icon: '🎁', text: '선물이야!',  hint: '고양이를 탭해서 선물을 받아주세요' },
};
const REQ_WEIGHTS = {
  dog:    { pet: 3, play: 1.5, snack: 1, brush: 2, gift: 1.2 },
  tsun:   { pet: 1, play: 1, snack: 2, brush: 1.5, gift: 0.6 },
  zoom:   { pet: 1, play: 4, snack: 1, brush: 1, gift: 1 },
  foodie: { pet: 1.5, play: 1, snack: 4, brush: 1, gift: 0.8 },
};
const GIFTS = ['🧦 양말', '🐭 쥐 인형', '🍂 낙엽', '🎀 리본', '🪶 깃털', '🧶 털실 조각', '🌸 꽃잎'];

const STARTER_TOYS = ['rod', 'ball'];
const TOYS = {
  rod:   { name: '낚싯대',   icon: '🎣', desc: '끌어서 흔들어요' },
  ball:  { name: '털실공',   icon: '🧶', desc: '바닥을 탭하면 굴려줘요' },
  laser: { name: '레이저',   icon: '🔴', desc: '끌어서 빨간 점을 움직여요' },
  brush: { name: '빗',       icon: '🪮', desc: '고양이를 문지르면 빗질해요' },
};

const NAME_IDEAS = ['나비', '치즈', '모모', '코코', '두부', '보리', '까망', '구름', '호두', '망고', '라떼', '뭉치', '탄이', '우유', '밤톨'];

// ===== 고양이 말풍선: 성격별로 조금씩 다른 공손한 냥체 =====
const LINES = {
  dog: {
    foodcall: ['밥이다냥! 집사님 최고예요♡', '밥 시간이에요냥! 지금 가요!'],
    snackcall: ['간식이에요냥?! 저요 저요!', '집사님~ 저 주세요냥♡'],
    greet: ['집사님! 보고 싶었어요냥♡', '집사님 옆이 제일 좋아요냥', '저 왔어요냥! 쓰다듬어 주실래요?'],
    pet: ['골골… 너무 좋아요냥♡', '거기요, 거기 최고예요냥~', '집사님 손이 최고예요냥!'],
    fed: ['잘 먹겠습니다냥!', '냠냠, 맛있어요냥♡'],
    snack: ['우와 간식이다냥! 감사해요♡', '집사님 최고예요냥!'],
    refuse: ['오늘은 배불러요냥… 내일 또 주세요♡'],
    thanks: ['부탁 들어주셔서 고마워요냥♡', '역시 우리 집사님이에요냥!'],
    hungry: ['집사님… 배가 고파요냥', '밥그릇이 비었어요냥…'],
    litter: ['화장실 좀 치워 주실래요냥?'],
    wheel: ['달려볼게요냥! 보세요!'],
    lizard: ['앗, 도마뱀이에요냥!'],
    caught: ['집사님! 제가 잡았어요냥! 칭찬해 주세요♡'],
    praised: ['헤헤, 칭찬 감사해요냥♡'],
    bite: ['앗, 너무 많이 만지셨어요냥…!'],
    morning: ['좋은 아침이에요냥! 오늘도 잘 부탁드려요♡'],
    req: { play: '놀아주세요냥!', pet: '쓰다듬어 주세요냥♡', snack: '간식 주실래요냥?', brush: '빗질해 주세요냥', gift: '선물이에요냥♡' },
  },
  tsun: {
    foodcall: ['…밥이요? 가 볼게요냥', '흠, 마침 배고팠어요냥'],
    snackcall: ['…그 간식, 제 거죠냥?', '딱히 원하는 건 아니지만… 주세요냥'],
    greet: ['…딱히 보고 싶었던 건 아니에요냥', '잠깐 들렀을 뿐이에요냥'],
    pet: ['…조금은 좋네요냥', '계속 해주셔도 괜찮아요냥…'],
    fed: ['…잘 먹을게요냥'],
    snack: ['흠, 나쁘지 않네요냥', '…고맙다고 해둘게요냥'],
    refuse: ['오늘은 됐어요냥. 사양할게요'],
    thanks: ['…고마워요냥. 조금이에요', '다음에도 부탁드려요냥…'],
    hungry: ['밥이… 없는 것 같은데요냥?'],
    litter: ['화장실이 좀… 지저분해요냥'],
    wheel: ['운동은 기본이에요냥'],
    lizard: ['…저건 뭐죠냥?'],
    caught: ['별거 아니지만… 잡았어요냥. 보세요'],
    praised: ['…당연한 일이에요냥. 그래도 고마워요'],
    bite: ['거기까지예요냥!'],
    morning: ['좋은 아침이네요냥'],
    req: { play: '…놀아주셔도 돼요냥', pet: '쓰다듬어 주실래요냥?', snack: '간식… 있나요냥?', brush: '털 정리 부탁해요냥', gift: '…드릴게요냥' },
  },
  zoom: {
    foodcall: ['밥이다냥! 다다다다!', '전속력으로 갈게요냥!'],
    snackcall: ['간식이다냥! 달려간다!', '저 먼저요냥! 빨리요!'],
    greet: ['집사님! 놀아요 놀아요냥!', '다다다! 왔어요냥!'],
    pet: ['좋아요냥! 이제 놀아주실 거죠?'],
    fed: ['에너지 충전이에요냥!'],
    snack: ['간식 파워 충전이다냥!'],
    refuse: ['오늘은 그만 먹을게요냥! 놀아주세요!'],
    thanks: ['최고예요냥! 또 해요 또!'],
    hungry: ['배고파서 못 뛰겠어요냥…'],
    litter: ['화장실이 꽉 찼어요냥!'],
    wheel: ['다다다다! 신난다냥!', '더 빨리 달릴 수 있어요냥!'],
    lizard: ['도마뱀이다냥! 잡을래요!'],
    caught: ['잡았다냥! 저 엄청 빠르죠?'],
    praised: ['헤헤, 또 잡아올게요냥!'],
    bite: ['앗! 장난이에요냥!'],
    morning: ['아침이다냥! 오늘은 뭐 하고 놀아요?'],
    req: { play: '놀아주세요냥! 빨리요!', pet: '쓰다듬어 주세요냥!', snack: '간식 주세요냥!', brush: '빗질해 주세요냥!', gift: '선물 가져왔어요냥!' },
  },
  foodie: {
    foodcall: ['밥!! 밥이에요냥!!', '기다렸어요냥! 밥이다!'],
    snackcall: ['간식 냄새예요냥!! 주세요!', '그거 제 간식 맞죠냥?!'],
    greet: ['집사님… 혹시 간식 있으세요냥?'],
    pet: ['좋아요냥… 그런데 밥은요?'],
    fed: ['냠냠냠! 행복해요냥♡', '한 그릇 더 주실 수 있나요냥?'],
    snack: ['이 맛이에요냥! 감사합니다!'],
    refuse: ['…아쉽지만 오늘은 참을게요냥'],
    thanks: ['감사해요냥! 배도 마음도 든든해요'],
    hungry: ['밥… 밥 주실 수 있나요냥?', '배에서 꼬르륵 소리가 나요냥…'],
    litter: ['화장실 청소 부탁드려요냥'],
    wheel: ['먹은 만큼 뛰어볼게요냥!'],
    lizard: ['저거… 먹는 건가요냥?'],
    caught: ['잡았어요냥! 먹진 않았어요, 보세요!'],
    praised: ['칭찬 감사해요냥! 간식도 주시면…'],
    bite: ['앗, 손이 간식인 줄 알았어요냥'],
    morning: ['좋은 아침이에요냥! 아침밥은요?'],
    req: { play: '놀아주실래요냥?', pet: '쓰다듬어 주세요냥', snack: '간식 주실 수 있나요냥?', brush: '빗질 부탁드려요냥', gift: '선물이에요냥!' },
  },
};

// 도마뱀: 낮에 가끔 나타나고, 고양이가 잡으면 자랑하러 옴 (게임 속 분)
const LIZARD = { GAP: [240, 480], LIFE: 45, CATCH: 0.55, PRAISE_COINS: 3, PRAISE_BOND: 1.5, SHOW_SEC: 15 };

// ===== 꾸미기: 고양이 소품 (한 번 사면 모든 고양이에게 씌울 수 있음) =====
const ACCESSORIES = {
  bell:    { slot: 'neck', name: '방울 목걸이',   icon: '🔔', price: 30 },
  ribbon:  { slot: 'neck', name: '분홍 리본',     icon: '🎀', price: 40 },
  bowtie:  { slot: 'neck', name: '나비넥타이',    icon: '🎗️', price: 50 },
  scarf:   { slot: 'neck', name: '체크 스카프',   icon: '🧣', price: 60 },
  flower:  { slot: 'head', name: '꽃핀',          icon: '🌸', price: 45 },
  star:    { slot: 'head', name: '별 머리띠',     icon: '⭐', price: 70 },
  beanie:  { slot: 'head', name: '니트 모자',     icon: '🧢', price: 80 },
  crown:   { slot: 'head', name: '작은 왕관',     icon: '👑', price: 150 },
  rainbow: { slot: 'neck', name: '무지개 스카프', icon: '🌈', price: 120, dealOnly: true, noColor: true },
  fishhat: { slot: 'head', name: '생선 모자',     icon: '🐟', price: 130, dealOnly: true },
};
// 방 꾸미기: 벽지, 바닥, 소파 색, 캣타워 색 (price 0 = 기본)
const ROOM_STYLES = {
  wall: {
    pink:  { name: '분홍 도트',   price: 0,   sw: ['#ffe2d2', '#ffb3c7'] },
    mint:  { name: '민트 줄무늬', price: 80,  sw: ['#e8f7f0', '#bfe7d6'] },
    sky:   { name: '하늘 구름',   price: 100, sw: ['#e3f3ff', '#ffffff'] },
    cream: { name: '크림 체크',   price: 120, sw: ['#fff6e8', '#ecd6b4'] },
    night: { name: '밤하늘 별',   price: 150, sw: ['#464a82', '#ffe08a'] },
  },
  floor: {
    wood:     { name: '원목 마루', price: 0,   sw: ['#e2b989', '#f0cfa2'] },
    white:    { name: '하얀 원목', price: 80,  sw: ['#efe6da', '#f9f4ec'] },
    pinktile: { name: '분홍 타일', price: 100, sw: ['#f6d3dc', '#fbe8ed'] },
    check:    { name: '체크 카펫', price: 120, sw: ['#e7d3f0', '#f7eefa'] },
  },
  sofa: {
    mint:   { name: '민트 소파', price: 0,  c: ['#9ccbbd', '#82b6a7', '#679a8b'] },
    pink:   { name: '분홍 소파', price: 60, c: ['#ffc4d3', '#f5a8bb', '#d9879c'] },
    yellow: { name: '노랑 소파', price: 60, c: ['#ffe39a', '#f5cf72', '#d6ac4f'] },
    navy:   { name: '남색 소파', price: 80, c: ['#8ea2d6', '#7186c0', '#5468a0'] },
  },
  tree: {
    beige:    { name: '베이지 캣타워',  price: 0,  c: ['#f3e3d3', '#e3cbb5', '#c9ae96'] },
    pink:     { name: '분홍 캣타워',    price: 60, c: ['#f7d6e0', '#e9b9c8', '#cf98aa'] },
    lavender: { name: '라벤더 캣타워',  price: 60, c: ['#ddd2f4', '#c6b6ea', '#a593d3'] },
    mint:     { name: '민트 캣타워',    price: 60, c: ['#d4f0e4', '#b6e0ce', '#94c4ae'] },
  },
};
const STYLE_LABEL = { wall: '🧱 벽지', floor: '🪵 바닥', sofa: '🛋️ 소파 색', tree: '🐱 캣타워 색' };

// 확장: 방 넓히기, 고양이 자리 늘리기
const EXPAND = { room: [300, 600], roomAdd: 120, slot: [500, 900] };
// 사진: 필름과 순간 도감 보상
const FILM = { pack: 5, price: 15, start: 3, newMoment: 5, complete: 50 };
const MOMENT_INFO = [
  ['loaf', '🍞', '식빵 굽기'], ['sleep', '💤', '쿨쿨 낮잠'], ['eat', '🥫', '냠냠 식사'], ['wheel', '🎡', '캣휠 질주'],
  ['treetop', '🗼', '캣타워 꼭대기'], ['sofa', '🛋️', '소파 위 휴식'], ['table', '🍽️', '식탁 위 장난'], ['box', '📦', '박스 속 고양이'],
  ['reach', '🙌', '두 발로 서기'], ['stretch', '🧘', '쭉 기지개'], ['groom', '👅', '단장 시간'], ['punch', '🥊', '냥냥펀치'],
  ['roll', '🌿', '캣잎에 뒹굴뒹굴'], ['lizard', '🦎', '도마뱀 사냥꾼'], ['friends', '💞', '다정한 친구들'], ['dressed', '🎀', '오늘의 멋쟁이'],
];

// ===== 끝없이 이어지는 목표들 =====
// 소품 색깔: 기본 + 7색 + 보호소 3단계에서 열리는 금색
const ACC_COLORS = {
  base:     { name: '기본', c: null },
  pink:     { name: '분홍', c: '#ff8fb1' },
  mint:     { name: '민트', c: '#6fd0a8' },
  sky:      { name: '하늘', c: '#6cb8f2' },
  lavender: { name: '보라', c: '#b08cf0' },
  lemon:    { name: '노랑', c: '#ffd23f' },
  coral:    { name: '다홍', c: '#ff6b5a' },
  navy:     { name: '남색', c: '#4a5a9a' },
  gold:     { name: '후원자 금색', c: '#f2b632', shelter: 3 },
};
const COLOR_PRICE_K = 0.6;   // 다른 색은 기본 가격의 60%

// 길고양이 보호소 후원: 단계마다 필요한 누적 후원액이 100, 300, 600, 1000…으로 끝없이 늘어남
const SHELTER = {
  need: tier => 100 * tier * (tier + 1) / 2,
  rescuedPerTier: 3,
  gifts: [['film', 5, '🎞️ 필름 5장'], ['tuna', 2, '🍥 참치 츄르 2개'], ['salmon', 2, '🍣 연어 큐브 2개'], ['catnip', 2, '🌿 캣잎 2개'], ['seedNip', 3, '🌱 캣잎 씨앗 3개']],
  goldTier: 3,
};

// 미션: [종류, 설명, 최소, 최대, 한 번당 코인]
const MISSION_KINDS = [
  ['pet', '💗 고양이 쓰다듬기', 3, 6, 4], ['snack', '🍬 간식 주기', 1, 3, 6], ['play', '🎣 장난감으로 놀아주기', 1, 3, 8],
  ['clean', '🧹 화장실·바닥 치우기', 3, 6, 3], ['request', '💬 부탁 들어주기', 2, 4, 6], ['brush', '🪮 빗질해 주기', 1, 2, 8],
  ['water', '💧 물그릇 물 갈아주기', 1, 1, 10], ['photo', '📷 고양이 사진 찍기', 1, 3, 6], ['feed', '🥫 배고픈 고양이 밥 먹이기', 1, 3, 6],
  ['lizard', '🦎 도마뱀 잡은 고양이 칭찬하기', 1, 1, 25], ['garden', '🪴 화분에 물 주기', 1, 2, 6],
];
const MISSION = { dailyCount: 3, allBonus: 20, weeklyCount: 2, weeklyMul: 5, weeklyBonus: 60, weeklyFilm: 3 };

// 사진 의뢰: 어려운 순간은 보상이 더 큼
const COMMISSION = { count: 2, base: 20, hard: 15, acc: 15, coat: 10, reroll: 5,
  hardMoments: ['treetop', 'lizard', 'roll', 'wheel', 'table', 'sofa', 'punch', 'reach'] };

// 창가 화분: 매일 물을 주면 하루에 한 단계씩 자람
const GARDEN = {
  pots: 3,
  seeds: {
    nip:    { name: '캣잎 씨앗', icon: '🌱', inv: 'seedNip', price: 10, days: 3 },
    flower: { name: '꽃 씨앗',   icon: '🌷', inv: 'seedFlower', price: 15, days: 4 },
  },
  nipHarvest: 2, goldenChance: 0.15, goldenCoins: 40, flowerCoins: 30,
};
