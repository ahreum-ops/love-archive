/** 커플 두 사람을 구분하는 키. a = 처음 가입한 사람, b = 초대받은 사람 */
export type Who = "a" | "b";

export type Profile = {
  names: Record<Who, string>;
  /** 사귄 날 (YYYY-MM-DD). 이 날이 1일째 */
  startDate: string;
  /** 지금 이 기기를 쓰는 사람 */
  me: Who;
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
};
