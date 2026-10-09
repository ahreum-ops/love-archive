/** 커플 두 사람을 구분하는 키. a = 처음 가입한 사람, b = 초대받은 사람 */
export type Who = "a" | "b";

export type Profile = {
  names: Record<Who, string>;
  /** 사귄 날 (YYYY-MM-DD). 이 날이 1일째 */
  startDate: string;
  /** 지금 이 기기를 쓰는 사람 */
  me: Who;
  /** 홈에 크게 보이는 커플 사진 (압축된 data URL) */
  photo?: string;
};

export type Anniversary = {
  id: string;
  title: string;
  emoji: string;
  /** YYYY-MM-DD */
  date: string;
  /** 매년 반복 (생일 등) */
  yearly: boolean;
};

export type BucketItem = {
  id: string;
  title: string;
  emoji: string;
  category: string;
  custom?: boolean;
  /** 완료한 날 (YYYY-MM-DD). 없으면 아직 안 함 */
  doneAt?: string;
  memo?: string;
  /** 완료 사진 (압축된 data URL) */
  photo?: string;
};

export type Letter = {
  id: string;
  from: Who;
  title?: string;
  body: string;
  /** 편지지 id (PAPERS) */
  paper: string;
  /** 쓴 시각 (ISO) */
  createdAt: string;
  /** 이 날부터 열어볼 수 있음 (YYYY-MM-DD). 없으면 바로 */
  openAt?: string;
  /** 받는 사람이 처음 연 시각 (ISO) */
  readAt?: string;
};

/** 우리집 고양이 생김새: tabby = 고등어+흰 블레이즈, patch = 흰 바탕에 귀·등 얼룩 */
export type CatLook = "tabby" | "patch";

export type Cat = {
  id: string;
  name: string;
  look: CatLook;
  xp: number;
  /** 0 ~ 100 */
  affection: number;
  /** 마지막으로 밥 · 물 · 화장실 챙긴 시각 (epoch ms). 지금과의 차이로 배고픔 등을 계산 */
  fedAt: number;
  wateredAt: number;
  cleanedAt: number;
  /** 오늘 쓰다듬은 횟수 (하루 제한) */
  petDay?: string;
  petCount?: number;
  /** 데려온 날 (YYYY-MM-DD) */
  adoptedAt: string;
};

export type CatAction = "feed" | "water" | "clean" | "pet" | "checkin";

export type CatLog = { at: number; by: Who; catId?: string; action: CatAction; xp: number };

/** 한 사람이 남긴 장소 후기 */
export type PlaceReview = {
  /** 1 ~ 5 (0.5 단위) */
  stars: number;
  comment?: string;
  /** 또 가고 싶어 */
  again?: boolean;
};

/** 함께 간 곳 */
export type Place = {
  id: string;
  name: string;
  /** PLACE_CATEGORIES 의 id */
  category: string;
  lat: number;
  lng: number;
  address?: string;
  /** 간 날 (YYYY-MM-DD) */
  visitedAt: string;
  reviews: Partial<Record<Who, PlaceReview>>;
  /** 그날 사진 (압축된 data URL) */
  photo?: string;
  createdBy: Who;
  /** 카카오 검색으로 고른 곳이면 그 장소 id (place.map.kakao.com/{id}) */
  kakaoId?: string;
};

export type Answers<T> = Record<string, Partial<Record<Who, T>>>;

export type AppState = {
  version: 1;
  profile: Profile | null;
  anniversaries: Anniversary[];
  bucket: BucketItem[];
  /** 밸런스 게임: 질문 id → 각자 고른 쪽 (0 | 1) */
  balance: Answers<0 | 1>;
  /** 취향 설문: 질문 id → 각자 고른 보기 */
  survey: Answers<string>;
  letters: Letter[];
  cats: Cat[];
  /** 사람별 마지막 출석일 + 연속 출석 */
  catCheckin: Partial<Record<Who, { date: string; streak: number }>>;
  /** 최근 돌봄 기록 (최신이 앞) */
  catLog: CatLog[];
  places: Place[];
};
