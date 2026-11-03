# 러브아카이브 💞

두 사람이 함께 쓰는 커플 웹앱(PWA). 사귄 날부터의 D-day, 버킷리스트, 편지, 함께 간 장소, 사진첩, 공유 캘린더, 채팅, 그리고 둘이 같이 키우는 냥이와 미니게임까지 한 앱에 담았다.

- 배포: https://love-archive-pearl.vercel.app (Vercel 개인 계정, `main` 푸시 시 자동 배포)
- 개인 프로젝트 — 회사 계정·회사 Vercel 팀은 쓰지 않는다.

## 기능 한눈에

| 화면 | 경로 | 하는 일 |
| --- | --- | --- |
| 홈 | `/` | 커플 사진 + 함께한 날, 다가오는 기념일, 냥이 방(출석·밥/물/똥·레벨), 사진첩·채팅 바로가기 |
| 채팅 | `/chat` | 말풍선·읽음·사진·이모지·하트 반응·보내기 취소, 실시간 + 푸시 |
| 버킷리스트 | `/bucket` | 기본 목록 + 직접 추가, 카드/목록 보기, 완료 사진·메모 |
| 우리의 장소 | `/places` | 지도 핀(카카오맵, 없으면 OpenStreetMap), 두 사람 별점·후기·또 갈 곳 |
| 편지 | `/letters` | 편지지 고르기, 예약 열람(그날까지 잠김), 읽음 표시 |
| 놀이 | `/play` | 밸런스 게임, 취향 설문, 냥이 배구(실시간 1:1 + 컴퓨터 연습), 길쭉 냥이(뱀 게임, 혼자 + 둘이 경쟁) |
| 캘린더 | `/days` | 일정·기념일(100일·주년 자동)·그날의 추억을 월 달력에 |
| 사진첩 | `/album` | 직접 올린 사진 + 버킷·장소 사진을 최신순으로, 안드로이드 갤러리 공유로 올리기 |

## 빠르게 시작하기

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 을 연다. `.env.local` 에 Supabase 키가 없으면 **체험 모드**(이 브라우저 localStorage 에만 저장)로 뜨고, `WhoSwitch` 로 두 사람 역할을 바꿔 가며 써 볼 수 있다. 서버 모드 설정은 [설정·배포](docs/setup-deploy.md) 참고.

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 기술 스택, 폴더 구조, 데이터 모델(AppState), 저장소 두 모드와 동시성 처리 |
| [docs/features.md](docs/features.md) | 기능별 동작·담당 파일·주의할 점 |
| [docs/server.md](docs/server.md) | Supabase 스키마·RLS·RPC, 실시간, Storage, 푸시 알림, 서비스워커 |
| [docs/setup-deploy.md](docs/setup-deploy.md) | 환경 변수, Supabase·카카오·VAPID·Vercel 설정, 자주 겪는 문제 |
| [docs/changelog.md](docs/changelog.md) | 지금까지 개발 이력과 로드맵 |
| [CLAUDE.md](CLAUDE.md) | AI 에이전트용 작업 메모 (짧은 요약판) |
