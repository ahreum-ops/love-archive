@AGENTS.md

# 러브아카이브 (couple-app)

두 사람이 쓰는 커플 웹앱(PWA). HR ERP 와는 무관한 개인 프로젝트 — 회사 계정(`@we-ar.kr`)·회사 Vercel 팀을 쓰지 않는다.

- 스택: Next.js 16 (App Router, `cacheComponents` 켜짐) + React 19 + Tailwind 4. 모든 화면은 클라이언트 컴포넌트.
- 데이터: `src/lib/store.ts`. `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 가 있으면 **서버 모드**, 없으면 **체험 모드**(localStorage).
  - 서버 모드: 커플 하나의 AppState 전체를 `couples.state`(jsonb)에 통으로 저장, `save_state(rev)` 로 낙관적 동시성 → 충돌 시 최신을 받아 같은 update fn 을 다시 적용. 실시간 구독으로 상대 변경 반영. 사진 data URL 은 저장 직전 Storage `photos` 버킷에 올려 URL 로 바꾼다. 스키마는 `supabase/schema.sql`(SQL Editor 에 붙여넣기).
  - `profile.me` 는 공유 state 에 의미 없음 — 로그인한 사람의 `who`(a=만든 사람, b=초대 코드로 들어온 사람)로 덮어쓴다.
  - 체험 모드에선 `WhoSwitch` 로 한 기기에서 두 사람 역할을 번갈아 테스트한다 (서버 모드에선 숨김).
- 콘텐츠(기본 버킷리스트·밸런스 질문·설문): `src/lib/content.ts`.
- 우리의 장소: `src/lib/places.ts`. 지도·검색은 카카오맵(`src/lib/kakao.ts`, `NEXT_PUBLIC_KAKAO_MAP_KEY` = JavaScript 키, 카카오 콘솔에 JavaScript SDK 도메인 등록 필요). 키가 없거나 안 뜨면 Leaflet + OpenStreetMap, 카카오가 못 찾는 곳(해외)은 Nominatim 검색 — 이용 규칙(초당 1회) 때문에 검색 버튼 누를 때만 호출.
- 사진첩(`/album`, 홈 카드에서 들어감 — 탭바는 7칸이 한계): 직접 올린 `photos` + 버킷 완료 사진 + 장소 사진을 `src/lib/album.ts` 가 모아 최신순으로. 버킷·장소 사진은 원래 화면에서만 고친다.
  - 갤러리 공유로 올리기: manifest `share_target` → `/share` POST 를 `public/sw.js` 가 가로채 캐시 `shared-photos` 에 넣고 `/album?shared=N` 으로 보냄 → 사진첩이 `takeSharedPhotos()`(`src/lib/sw.ts`)로 꺼내 올리기 시트를 연다. 설치된 안드로이드 PWA 전용(iOS 는 미지원). 서비스워커는 앱 셸이 항상 등록한다.
- 공유 캘린더(`/days`, 탭 이름 '캘린더'): 일정 `plans`(누구 일정·시간·여러 날) + 기념일(자동 100일·주년 포함) + 그날의 추억(버킷·장소·사진)을 `src/lib/calendar.ts` 가 날짜별로 모은다. `today()` 는 프리렌더 중 못 부르니 useState 초기값에 쓰지 말 것.
- 채팅(`/chat`, 탭바 두 번째 칸 — 안 읽은 수 배지 — 와 홈 카드로 들어감, 이 화면에선 탭바를 숨기고 ‹ 로 홈): `src/lib/chat.ts`. 메시지는 AppState 가 **아니다** — 서버 모드는 Supabase `messages` 테이블(RLS 로 같은 커플만, insert 는 내 who 로만, 읽음·반응·보내기 취소는 RPC `mark_messages_read`·`react_message`·`unsend_message` 로만, 보내기 취소는 지우지 않고 `deleted`), 체험 모드는 localStorage `love-archive:chat:v1`. 최근 40개씩(`PAGE`) 불러오고 위로 올리면 이전 대화. 보내기는 낙관적 → 실패하면 '다시 보내기'. 채팅 사진은 Storage `photos/<couple_id>/chat/`. 보내기·반응·보내기 취소마다 푸시를 보내고, 받는 기기에서 채팅 화면을 보고 있을 때만 서비스워커가 알림을 안 띄운다(예전 presence 방식은 알림이 막히는 일이 있어 뺐다).
- 냥이 배구(`/play/volley`, 피카츄 배구 같은 1:1, 이 화면에선 탭바 숨김): 물리는 `src/lib/volley.ts`(순수 계산, 11점 승리), 화면·터치 조작은 `components/volley-game.tsx`. 실시간 대결은 `src/lib/volley-room.ts` — Realtime 채널 `volley-<coupleId>` 의 presence(들어옴·준비)와 broadcast 만 쓰고 DB 에 저장하지 않는다. a 가 호스트로 공·점수를 계산해 스냅숏을, b 는 자기 냥이 위치만 보낸다(각 15Hz, 무료 요금제 메시지 한도 고려). b 화면은 좌우를 뒤집어 내 냥이가 늘 왼쪽. 컴퓨터 상대 연습은 체험 모드에서도 된다. 미리보기 창이 숨겨져 있으면 requestAnimationFrame 이 안 돌아서 게임이 멈춰 보인다. 체험 모드 개발 서버는 `.claude/launch.json` 의 `dev-trial`.
- 냥이 키우기: `src/lib/cats.ts`. 배고픔·물·똥은 저장하지 않고 마지막으로 챙긴 시각(epoch ms)에서 계산한다. 생김새는 `cat-sprite.tsx` 의 SVG (실제 두 냥이 무늬).
- 푸시 알림 (서버 모드): `src/lib/push.ts` 가 저장 성공 뒤 전후 state 를 비교해 내가 한 일 하나를 골라(채팅은 `chat.ts` 가 보낸 직후 직접 `sendPush`) `/api/push`(로그인 토큰 + RLS 로 같은 커플 구독만 읽음, `web-push`)로 보낸다. 서비스워커는 `public/sw.js`. 구독은 기기마다 설정 시트에서 켠다. 추가·수정·삭제·냥이 돌보기·출석까지 모든 행동을 알린다(못 고른 변경도 맨 끝에서 한 번은 알림). VAPID 키는 `.env.local`·Vercel 환경 변수.
- 날짜는 `YYYY-MM-DD` 문자열 + UTC 계산(`src/lib/dates.ts`). 사귄 날 = 1일째.
- 디자인: 파스텔 몽글. 색 토큰은 `globals.css` 의 `@theme`. 글꼴 Gowun Dodum(본문)·Jua(제목, `font-cute`).
- 저장 실패는 삼키지 말고 `<Banner>` 로 보여준다. 빈 화면엔 원인 + 다음 행동을 같이 준다.
- 서버 렌더링 중에도 레이아웃이 `children` 을 그려야 한다(안 그러면 Next 16 instant-navigation 경고).

## 로드맵
1. ✅ D-day·기념일, 홈 커플 사진, 버킷리스트(직접 추가·카드/목록·완료 사진), 편지(편지지·예약 열람·읽음), 밸런스 게임·취향 설문(다시 누르면 취소), 우리집 냥이 키우기(홈 방·출석·밥/물/똥·레벨), 우리의 장소(지도 핀·두 사람 별점/후기·또 갈 곳) — 체험 모드
2. ✅ Supabase 연결: 이메일+비밀번호 로그인, 초대 코드로 커플 연결, 실시간 동기화, 사진은 Storage → Vercel(개인 계정) 배포
3. ✅ 푸시 알림 (편지·버킷·장소·기념일·놀이·사진첩·일정), 사진첩, 공유 캘린더
4. ✅ 채팅(말풍선·읽음·사진·이모지·하트 반응·보내기 취소, 실시간 + 푸시)
5. ✅ 냥이 배구(각자 폰 실시간 1:1 + 컴퓨터 연습)
6. 예약 편지 열리는 날 알림(크론 필요)
