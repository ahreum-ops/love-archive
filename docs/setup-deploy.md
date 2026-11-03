# 설정 · 배포

## 로컬 실행

```bash
npm install
```

```bash
npm run dev
```

- `.env.local` 이 없거나 Supabase 키가 비어 있으면 **체험 모드**로 뜬다.
- 서버 키가 있어도 체험 모드로 보고 싶으면 `.claude/launch.json` 의 `dev-trial` 설정(Supabase 변수를 비워서 실행)을 쓴다.
- 그 밖의 명령: `npm run build`, `npm run start`, `npm run lint`

## 환경 변수

`.env.example` 을 `.env.local` 로 복사해서 채운다.

| 변수 | 어디서 | 비워 두면 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | 체험 모드 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 〃 | 체험 모드 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | 설정의 알림 켜기가 '지원 안 함' |
| `VAPID_PRIVATE_KEY` | 〃 (서버 전용, 절대 `NEXT_PUBLIC_` 붙이지 말 것) | `/api/push` 가 501 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | developers.kakao.com → 앱 → 플랫폼 키 → **JavaScript 키** | 지도가 OpenStreetMap 으로 |

`NEXT_PUBLIC_*` 는 빌드할 때 박히므로 Vercel 에서 바꾸면 **Redeploy** 해야 반영된다.

## Supabase

1. 프로젝트 만들기 → SQL Editor 에 `supabase/schema.sql` 전체 붙여넣고 Run.
2. Authentication → Providers → Email: **Confirm email 끔** (지금 설정).
3. Authentication → URL Configuration: **Site URL·Redirect URLs 를 배포 주소로.** localhost 로 남아 있으면 비밀번호 재설정 메일 링크가 로컬로 간다.
4. 스키마를 바꿀 때마다 SQL Editor 에 다시 붙여넣는다 (자동 적용 안 됨).

## 카카오맵

- 개인 카카오 계정의 앱을 쓴다.
- 플랫폼 키 → JavaScript 키 카드 ⋮ → 수정 → **JavaScript SDK 도메인**에 `http://localhost:3000`(·3100)과 배포 주소를 등록. 새 주소가 생기면 여기 추가해야 지도가 뜬다.
- 제품 설정 → **카카오맵 ON**.

## Vercel

- 개인 계정(Hobby), GitHub `main` 에 푸시하면 자동 배포.
- Settings → Environment Variables 에 위 변수를 넣는다. 여러 줄을 한꺼번에 붙여넣으면 이름이 잘리거나 빠질 수 있으니 **Key/Value 하나씩** 넣는다.
- 넣은 뒤 확인: 배포 주소의 `/api/push` 에 POST 해서 `501` + `missing` 이 안 나오면 키는 다 들어간 것.

```bash
curl -X POST https://love-archive-pearl.vercel.app/api/push
```

(로그인 토큰이 없으니 키가 다 있으면 `401 not_signed_in` 이 정상)

## 자주 겪는 문제

| 증상 | 확인할 곳 |
| --- | --- |
| 비번 재설정 메일 링크가 localhost 로 감 | Supabase → Authentication → URL Configuration |
| 지도가 OpenStreetMap 으로만 뜸 | 카카오 JavaScript SDK 도메인 등록, 카카오맵 ON, Vercel 의 `NEXT_PUBLIC_KAKAO_MAP_KEY` + Redeploy |
| 알림 켜기가 '지원 안 함' | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, iOS 는 홈 화면에 추가한 앱에서만 웹 푸시 가능 |
| 알림이 안 옴 | `/api/push` 응답의 `missing`, 받는 기기에서 설정 시트로 알림을 켰는지 |
| 갤러리 공유 목록에 앱이 없음 | 안드로이드에서 앱을 **설치**해야 뜬다 (iOS 미지원) |
| 냥이 배구가 멈춰 보임 | 브라우저 탭/미리보기 창이 숨겨져 있으면 requestAnimationFrame 이 멈춘다 |
| "저장이 계속 겹쳤어요" | 두 사람이 동시에 계속 고침 → 잠시 뒤 다시. 반복되면 `save_state`·실시간 구독 확인 |
