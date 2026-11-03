# 구조

## 기술 스택

- **Next.js 16** (App Router, `cacheComponents`·`partialPrefetching` 켜짐) + **React 19** + **Tailwind 4**
  - 이 버전은 예전 Next 와 API·관례가 다르다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 를 확인한다.
- 모든 화면은 클라이언트 컴포넌트(`"use client"`). 서버 코드는 `/api/push`, `/share` 라우트뿐.
- **Supabase**: 인증(이메일+비밀번호), Postgres(jsonb), Realtime, Storage
- 지도: 카카오맵 JavaScript SDK → 실패 시 **Leaflet + OpenStreetMap**
- 푸시: Web Push(VAPID) + `web-push` 패키지
- 배포: Vercel (개인 계정, Hobby)

## 폴더 구조

```
src/
  app/                    화면 (경로 = 폴더)
    page.tsx              홈
    chat/ bucket/ places/ letters/ days/ album/
    play/                 놀이 목록 + balance/ survey/ volley/ snake/
    api/push/route.ts     연인 기기로 푸시 보내기 (서버)
    share/route.ts        갤러리 공유 POST 의 대비용 (보통은 서비스워커가 가로챔)
    manifest.ts           PWA manifest (share_target 포함)
    layout.tsx globals.css apple-icon.tsx
  components/             화면 조각 · 시트(bottom sheet)
    app-shell.tsx         탭바(7칸) · 로그인/커플 연결 분기 · 서비스워커 등록
    ui.tsx                공통 UI (Banner 등)
    *-sheet.tsx           추가/수정 시트
    cat-room.tsx cat-sprite.tsx volley-game.tsx snake-game.tsx place-map.tsx ...
  lib/                    로직 (화면과 분리)
    store.ts              AppState 저장소 (체험/서버 모드)
    types.ts              데이터 타입
    chat.ts               채팅 저장소 (AppState 와 별개)
    push.ts               푸시 구독 · 무엇을 알릴지 고르기
    dates.ts              날짜 계산 (YYYY-MM-DD + UTC)
    content.ts            기본 버킷·밸런스 질문·설문·편지지
    cats.ts places.ts calendar.ts album.ts letters.ts
    volley.ts volley-room.ts snake.ts snake-room.ts kakao.ts sw.ts image.ts josa.ts supabase.ts
scripts/                  게임 순수 계산 점검 (npm run check:volley · check:snake, Node 가 .ts 를 바로 실행)
public/sw.js              서비스워커 (푸시 + 공유 받기, 오프라인 캐시 없음)
supabase/schema.sql       DB 스키마 (SQL Editor 에 붙여넣기)
```

## 데이터 모델

커플 하나의 모든 기록은 `AppState` 하나에 들어 있다 (`src/lib/types.ts`).

| 필드 | 내용 |
| --- | --- |
| `profile` | 두 사람 이름, 사귄 날(`startDate`, 이 날이 1일째), 홈 커플 사진, `me`(지금 기기 쓰는 사람) |
| `anniversaries` | 직접 등록한 기념일 (`yearly` 면 매년) |
| `bucket` | 버킷리스트 (`doneAt`·`memo`·`photo`) |
| `balance` / `survey` | 질문 id → 사람별 답 |
| `letters` | 편지 (`openAt` 예약 열람, `readAt` 읽음) |
| `cats` / `catCheckin` / `catLog` | 냥이, 사람별 출석·연속 출석, 최근 돌봄 기록 |
| `places` | 함께 간 곳 (좌표·사람별 후기·사진·`kakaoId`) |
| `photos` | 사진첩에 직접 올린 사진 |
| `plans` | 공유 캘린더 일정 (누구 일정·시간·여러 날) |

**AppState 에 없는 것**: 채팅 메시지(`messages` 테이블), 냥이 배구·길쭉 냥이 경기 상태(저장 안 함, 길쭉 냥이 혼자 하기 최고 기록만 기기 localStorage), 푸시 구독(`push_subscriptions`).

사람은 `Who = "a" | "b"` 로 구분한다. a = 커플을 만든 사람, b = 초대 코드로 들어온 사람.

## 저장소 (`src/lib/store.ts`)

`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 가 있으면 **서버 모드**, 없으면 **체험 모드**.

화면은 `useAppState()`·`useSession()` 훅으로 읽고, 바꿀 때는 항상 `update(s => 새 state)` 를 부른다. 두 모드 모두 `useSyncExternalStore` 기반이다.

### 체험 모드

- localStorage `love-archive:v1` 에 통째로 저장. 다른 탭의 변경도 `storage` 이벤트로 반영.
- `WhoSwitch` 로 한 기기에서 a/b 를 바꿔 가며 테스트 (서버 모드에선 숨김).
- 저장 공간이 차면 실패를 돌려준다 → 화면이 `<Banner>` 로 보여 준다.
- 서버 커플을 만들 때 체험 데이터를 가져올 수 있다(`createCouple(profile, importTrial)`).

### 서버 모드

```
update(fn) ─▶ pending 에 쌓고 화면에 바로 반영 (낙관적)
            └▶ flush(): 사진 data URL 을 Storage 에 올려 URL 로 바꿈
                       → rpc save_state(expected=rev, next)
                          ├ 새 rev 반환 → 저장 완료 → notifyPartner(전, 후) 로 푸시
                          └ null(상대가 먼저 저장) → 최신 state 받아 같은 fn 다시 적용 (최대 5번)
```

- 커플 하나 = `couples` 한 줄, `state`(jsonb)에 AppState 전체, `rev` 로 낙관적 동시성.
- update fn 은 **여러 번 다시 실행될 수 있다**. 같은 base 에선 결과를 캐시해 `uid()` 가 매번 바뀌지 않게 한다. fn 안에서 부수효과를 내지 말 것.
- 실시간 구독으로 상대가 저장한 state 를 받아 반영한다.
- `profile.me` 는 공유 state 에선 의미가 없어서, 읽을 때 로그인한 사람의 `who` 로 덮어쓴다.
- 저장 실패는 `useSyncError()` 로 알리고 `<Banner>` 로 보여 준다. 실패하면 대기 중 변경을 버리고 서버 최신으로 되돌린다.

### 로그인 상태 (`Session`)

`loading` → `signed-out` / `recovery`(비번 재설정 링크로 들어옴) / `no-couple`(로그인했지만 커플 없음) / `ready`(who·coupleId·inviteCode·partnerJoined).

## 화면 규칙

- 저장 실패는 삼키지 말고 `<Banner>` 로 보여 준다. 빈 화면엔 원인 + 다음 행동을 같이 준다.
- 서버 렌더링 중에도 레이아웃이 `children` 을 그려야 한다 (안 그러면 Next 16 instant-navigation 경고).
- `today()` 는 프리렌더 중에 부르면 안 된다 → `useState` 초기값에 쓰지 말고 effect 에서.
- 날짜는 전부 `YYYY-MM-DD` 문자열 + UTC 계산(`dates.ts`).
- 사진은 올리기 전에 `compressImage()` 로 긴 변 720px JPEG 로 줄인다.
- 디자인: 파스텔 몽글. 색 토큰은 `globals.css` 의 `@theme`, 글꼴 Gowun Dodum(본문)·Jua(제목, `font-cute`).
- 하단 탭바는 7칸(홈·채팅·버킷·장소·편지·놀이·캘린더)이 한계. 사진첩은 홈 카드로 들어간다. 채팅·냥이 배구·길쭉 냥이 화면에선 탭바를 숨긴다.
