@AGENTS.md

# 러브아카이브 (couple-app)

두 사람이 쓰는 커플 웹앱(PWA). HR ERP 와는 무관한 개인 프로젝트 — 회사 계정(`@we-ar.kr`)·회사 Vercel 팀을 쓰지 않는다.

- 스택: Next.js 16 (App Router, `cacheComponents` 켜짐) + React 19 + Tailwind 4. 모든 화면은 클라이언트 컴포넌트.
- 데이터: `src/lib/store.ts`. `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 가 있으면 **서버 모드**, 없으면 **체험 모드**(localStorage).
  - 서버 모드: 커플 하나의 AppState 전체를 `couples.state`(jsonb)에 통으로 저장, `save_state(rev)` 로 낙관적 동시성 → 충돌 시 최신을 받아 같은 update fn 을 다시 적용. 실시간 구독으로 상대 변경 반영. 사진 data URL 은 저장 직전 Storage `photos` 버킷에 올려 URL 로 바꾼다. 스키마는 `supabase/schema.sql`(SQL Editor 에 붙여넣기).
  - `profile.me` 는 공유 state 에 의미 없음 — 로그인한 사람의 `who`(a=만든 사람, b=초대 코드로 들어온 사람)로 덮어쓴다.
  - 체험 모드에선 `WhoSwitch` 로 한 기기에서 두 사람 역할을 번갈아 테스트한다 (서버 모드에선 숨김).
- 콘텐츠(기본 버킷리스트·밸런스 질문·설문): `src/lib/content.ts`.
- 우리의 장소: `src/lib/places.ts`. 지도는 Leaflet + OpenStreetMap 타일(키 없음), 검색·주소는 Nominatim — 이용 규칙(초당 1회) 때문에 검색 버튼 누를 때만 호출.
- 냥이 키우기: `src/lib/cats.ts`. 배고픔·물·똥은 저장하지 않고 마지막으로 챙긴 시각(epoch ms)에서 계산한다. 생김새는 `cat-sprite.tsx` 의 SVG (실제 두 냥이 무늬).
- 날짜는 `YYYY-MM-DD` 문자열 + UTC 계산(`src/lib/dates.ts`). 사귄 날 = 1일째.
- 디자인: 파스텔 몽글. 색 토큰은 `globals.css` 의 `@theme`. 글꼴 Gowun Dodum(본문)·Jua(제목, `font-cute`).
- 저장 실패는 삼키지 말고 `<Banner>` 로 보여준다. 빈 화면엔 원인 + 다음 행동을 같이 준다.
- 서버 렌더링 중에도 레이아웃이 `children` 을 그려야 한다(안 그러면 Next 16 instant-navigation 경고).

## 로드맵
1. ✅ D-day·기념일, 홈 커플 사진, 버킷리스트(직접 추가·카드/목록·완료 사진), 편지(편지지·예약 열람·읽음), 밸런스 게임·취향 설문(다시 누르면 취소), 우리집 냥이 키우기(홈 방·출석·밥/물/똥·레벨), 우리의 장소(지도 핀·두 사람 별점/후기·또 갈 곳) — 체험 모드
2. ✅ Supabase 연결: 이메일+비밀번호 로그인, 초대 코드로 커플 연결, 실시간 동기화, 사진은 Storage → Vercel(개인 계정) 배포
3. 공유 캘린더, 채팅, 홈 화면 알림
