# 서버 (Supabase · 푸시 · 서비스워커)

스키마 원본은 `supabase/schema.sql`. Supabase 대시보드 → **SQL Editor** 에 통째로 붙여넣고 Run (여러 번 실행해도 안전). 스키마를 바꾸면 이 파일을 고치고 다시 붙여넣는다 — 자동 마이그레이션은 없다.

## 테이블

| 테이블 | 내용 |
| --- | --- |
| `couples` | 커플 하나 = 한 줄. `invite_code`(6자리), `state`(jsonb, AppState 전체), `rev` |
| `couple_members` | `user_id`(한 사람은 한 커플만) ↔ `couple_id` + `who`('a'/'b') |
| `push_subscriptions` | 기기(브라우저)마다 푸시 구독 하나. `endpoint` 가 키 |
| `messages` | 채팅 메시지 한 줄씩 |

## 권한 (RLS)

모든 테이블에 RLS 를 켰다. 기준은 `my_couple_id()`(security definer) — 로그인한 사람이 속한 커플 id.

- **읽기**: 같은 커플 것만.
- **쓰기**: `couples`·`couple_members`·`push_subscriptions` 는 insert/update 정책이 없고 아래 함수로만 바꾼다. `messages` 는 insert 정책(내 커플 + 내 who + 깨끗한 상태로만)이 있고, 나머지 변경은 함수로만.
- 함수는 `anon`·`public` 에서 실행 권한을 빼고 `authenticated` 에만 준다.

## RPC 함수

| 함수 | 하는 일 |
| --- | --- |
| `create_couple(initial)` | 커플을 만들고 나를 a 로 넣는다. 이미 커플이면 `already_in_couple` |
| `join_couple(code)` | 초대 코드로 b 로 들어간다. `invalid_code` / `couple_full` / `already_in_couple` |
| `save_state(expected, next)` | `rev = expected` 일 때만 저장하고 새 rev 반환, 아니면 null(누가 먼저 고침) |
| `my_couple_id()` / `my_who()` | RLS 용 도우미 |
| `save_push_subscription(endpoint, p256dh, auth)` | 구독 저장. 같은 기기로 다른 계정이 로그인하면 마지막 사람 것으로 바뀐다 |
| `mark_messages_read()` | 상대가 보낸 메시지를 지금까지 전부 읽음으로 |
| `react_message(mid, emoji)` | 반응 달기 (빈 문자열이면 내 반응 지우기) |
| `unsend_message(mid)` | 내가 보낸 메시지 보내기 취소 |

## 채팅 (`messages`)

- 컬럼: `sender`('a'/'b'), `body`(최대 2000자), `photo`, `reactions`(jsonb, who → 이모지), `read_at`, `deleted`, `created_at`
- 인덱스 `(couple_id, created_at desc)` 로 최근 것부터 페이지.
- 보내기 취소는 **지우지 않고** `deleted = true` + 내용 비우기. 실시간 DELETE 이벤트엔 커플 필터가 안 걸려서.

## 실시간 (Realtime)

`supabase_realtime` publication 에 `couples`, `couple_members`, `messages` 를 넣었다.

- `couples`: 상대가 저장하면 바로 반영.
- `couple_members`: 연인이 초대 코드로 들어오면 만든 사람 화면에도 바로 반영.
- `messages`: 새 메시지·읽음·반응.
- 냥이 배구는 테이블 없이 채널 `volley-<coupleId>` 의 presence + broadcast 만 쓴다.
- 길쭉 냥이 둘이 모드도 마찬가지로 채널 `snake-<coupleId>` (호스트 10Hz 스냅숏, b 는 방향이 바뀔 때만).

## Storage

- 공개 버킷 `photos`, 경로 `<couple_id>/<랜덤>.jpg` (채팅은 `<couple_id>/chat/...`).
- URL 을 아는 사람은 볼 수 있다(URL 은 추측 불가능한 랜덤). 올리기·지우기는 경로 첫 폴더가 내 커플 id 일 때만.
- AppState 안의 사진은 화면에선 data URL 로 다루다가, 저장 직전에 `store.ts` 의 `uploadPhotos()` 가 올리고 URL 로 바꾼다.

## 푸시 알림

```
저장 성공 (store.ts flush)
  → notifyPartner(전 state, 후 state, 나)
  → push.ts describe(): 무엇이 바뀌었는지 보고 알림 하나를 고름
  → sendPush(): POST /api/push  (Authorization: Bearer <로그인 토큰>)
  → route.ts: 그 토큰으로 Supabase 를 불러 RLS 가 허락하는 구독(같은 커플) 중 내 것이 아닌 것에 web-push
  → 연인 기기 서비스워커 push 이벤트 → 알림 표시
```

- 채팅은 `chat.ts` 가 보낸 직후 직접 `sendPush` (태그 `chat`).
- `describe()` 는 편지·버킷·장소·사진첩·일정·기념일·프로필·밸런스·설문·냥이(돌보기·출석·이름) 순으로 확인한다. 추가·수정·삭제 모두 알리고, 못 고른 변경도 맨 끝에서 "우리 기록을 고쳤어요" 로 한 번은 알린다.
- **서비스 키가 필요 없다** — 사용자 토큰 + RLS 로만 구독을 읽는다.
- `/api/push` 응답
  - `501 push_not_configured` + `missing`: 비어 있는 환경 변수 이름 (값은 숨김). Vercel 설정 확인용.
  - `401 not_signed_in`, `400 bad_payload`(이동 경로는 앱 안 `/...` 만 허용, 제목 80자·본문 200자로 자름)
  - 성공: `{ devices, sent, failed: [{ status, reason, removed }] }`. 404/410(알림 끔·앱 데이터 삭제)·403(다른 VAPID 키로 만든 구독)을 돌려준 구독은 지운다. 그 기기는 앱을 열 때 `refreshPush` 가 지금 키로 새로 구독한다.
  - `to: "me"` 면 연인 대신 내 기기들로 보낸다 (설정 시트의 알림 시험).
- 구독은 기기마다 설정 시트에서 켠다. VAPID 키는 `.env.local`·Vercel 환경 변수.

## 서비스워커 (`public/sw.js`)

오프라인 캐시는 없다. 하는 일은 세 가지:

1. **push**: 알림 표시. 같은 `tag` 는 하나로 합치고 `renotify` 로 소리는 다시. 태그가 `chat` 이고 이 기기에서 `/chat` 창이 보이고 포커스돼 있으면 띄우지 않는다. (그 외엔 꼭 띄워야 한다 — 안 띄우면 크롬이 '백그라운드에서 업데이트됨' 알림을 대신 띄운다.)
2. **notificationclick**: 열린 앱 창이 있으면 그 창으로 가서 해당 화면으로 이동, 없으면 새로 연다.
3. **fetch(POST /share)**: 갤러리 공유 받기 → [features.md](features.md#갤러리-공유로-올리기-설치된-안드로이드-pwa-전용-ios-미지원).
