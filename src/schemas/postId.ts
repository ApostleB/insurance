/** PostgreSQL Int4 상한 — 이 값을 넘으면 Prisma 조회 자체가 에러가 된다 */
const MAX_POST_ID = 2_147_483_647;

/**
 * URL 파라미터의 게시글 id를 안전한 정수로 변환한다.
 * 유효하지 않으면 null을 반환하므로, 호출부는 404로 처리하면 된다.
 *
 * 상한을 두지 않으면 Int4를 넘는 값이 Prisma까지 흘러가 500이 된다.
 * 존재하지 않는 글이므로 404가 맞고, 500이면 운영 알림까지 잘못 발사된다.
 */
export function parsePostId(raw: unknown): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > MAX_POST_ID) return null;
  return id;
}
