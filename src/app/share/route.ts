// 갤러리 공유(manifest share_target)는 보통 서비스워커(public/sw.js)가 가로챈다.
// 서비스워커가 아직 이 페이지를 맡기 전(설치 직후 등)에만 여기로 오니, 사진은 못 받았다고 알리고 사진첩으로 보낸다.
export function POST(req: Request) {
  return Response.redirect(new URL("/album?shared=0", req.url), 303);
}

export function GET(req: Request) {
  return Response.redirect(new URL("/album", req.url), 303);
}
