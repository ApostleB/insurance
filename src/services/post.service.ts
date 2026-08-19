import type { Post, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { PostInput } from '../schemas/post.schema';
import { sanitizePostContent } from './sanitize.service';

/**
 * 공개 목록과 슬라이드가 공유하는 정렬 규칙.
 * 고정 글이 먼저, 그다음 sortOrder 오름차순(작을수록 위), 같으면 최신 글 먼저.
 */
const PUBLIC_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { isPinned: 'desc' },
  { sortOrder: 'asc' },
  { createdAt: 'desc' },
];

export function listPublishedPosts(): Promise<Post[]> {
  return prisma.post.findMany({
    where: { isPublished: true },
    orderBy: PUBLIC_ORDER,
  });
}

export function getPublishedPost(id: number): Promise<Post | null> {
  return prisma.post.findFirst({ where: { id, isPublished: true } });
}

/** 홈 슬라이드용 — 게시 중이면서 홈 노출로 지정된 글만 */
export function listSlides(): Promise<Post[]> {
  return prisma.post.findMany({
    where: { isPublished: true, showOnHome: true },
    orderBy: PUBLIC_ORDER,
  });
}

/** 관리자 목록 — 비공개 글도 모두 보인다 */
export function listAllPosts(): Promise<Post[]> {
  return prisma.post.findMany({ orderBy: PUBLIC_ORDER });
}

export function getPost(id: number): Promise<Post | null> {
  return prisma.post.findUnique({ where: { id } });
}

export function createPost(input: PostInput & { mainImage: string }): Promise<Post> {
  return prisma.post.create({
    data: {
      title: input.title,
      content: sanitizePostContent(input.content),
      mainImage: input.mainImage,
      sourceUrl: input.sourceUrl ?? null,
      isPinned: input.isPinned,
      showOnHome: input.showOnHome,
      isPublished: input.isPublished,
    },
  });
}

export function updatePost(
  id: number,
  input: PostInput & { mainImage?: string },
): Promise<Post> {
  return prisma.post.update({
    where: { id },
    data: {
      title: input.title,
      content: sanitizePostContent(input.content),
      // 새 이미지를 올리지 않았으면 기존 값을 유지한다
      ...(input.mainImage ? { mainImage: input.mainImage } : {}),
      sourceUrl: input.sourceUrl ?? null,
      isPinned: input.isPinned,
      showOnHome: input.showOnHome,
      isPublished: input.isPublished,
    },
  });
}

export function deletePost(id: number): Promise<Post> {
  return prisma.post.delete({ where: { id } });
}

/**
 * 노출 순서 변경.
 *
 * 신규 글은 sortOrder=0으로 저장되므로 값이 전부 같을 수 있다.
 * 그 상태로 스왑하면 아무 변화가 없으므로, 조정 시점에 현재 표시 순서대로
 * 1,2,3...을 재부여한 뒤 인접한 두 글의 값을 맞바꾼다.
 *
 * 고정(isPinned) 그룹 경계를 넘는 이동은 수행하지 않는다.
 * 정렬이 `isPinned DESC`를 최우선으로 적용하므로, 고정 글과 일반 글 사이에서
 * sortOrder만 맞바꿔도 각 그룹 내부의 상대 순서는 그대로라 화면상 아무 효과가 없다
 * (예: 고정 글 목록 끝에서 일반 글 목록 시작으로 넘어가는 이동). 고정 여부 자체는
 * 관리자 목록의 '고정' 토글로 바꾸고, movePost는 같은 그룹 안에서만 순서를 바꾼다.
 */
export async function movePost(id: number, direction: 'up' | 'down'): Promise<void> {
  const posts = await listAllPosts();

  // 현재 표시 순서대로 1부터 재부여
  const renumbered = posts.map((post, index) => ({ ...post, sortOrder: index + 1 }));

  const currentIndex = renumbered.findIndex((post) => post.id === id);
  if (currentIndex === -1) return;

  const current = renumbered[currentIndex]!;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= renumbered.length) return; // 경계 밖이면 무시

  const target = renumbered[targetIndex]!;
  // 고정 그룹 경계를 넘는 이동은 화면상 아무 효과가 없으므로 수행하지 않는다
  if (target.isPinned !== current.isPinned) return;

  const swapped = [current.sortOrder, target.sortOrder];
  current.sortOrder = swapped[1]!;
  target.sortOrder = swapped[0]!;

  // 재부여된 값 전체를 한 트랜잭션으로 저장
  await prisma.$transaction(
    renumbered.map((post) =>
      prisma.post.update({ where: { id: post.id }, data: { sortOrder: post.sortOrder } }),
    ),
  );
}
