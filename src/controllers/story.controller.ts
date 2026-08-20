import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { getPublishedPost, listPublishedPosts, listSlides } from '../services/post.service';

/** 이야기 목록 (공개) */
export const renderStoryList: RequestHandler = async (_req, res) => {
  const posts = await listPublishedPosts();
  res.render('story/list', {
    pageTitle: `이야기 | ${env.SITE_NAME}`,
    pageDescription: `${env.AGENT_NAME} 설계사의 자격, 경력, 보험 상식과 상담 사례를 소개합니다.`,
    posts,
  });
};

/** PostgreSQL Int4 상한 — 이 값을 넘으면 조회 자체가 DB 에러가 되므로 미리 걸러낸다 */
const MAX_POST_ID = 2_147_483_647;

/** 이야기 상세 (공개) — 존재하지 않거나 비공개 글, 잘못된 id는 404로 넘긴다 */
export const renderStoryDetail: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  // 상한을 두지 않으면 Int4를 넘는 값이 Prisma까지 흘러가 500이 된다. 없는 글이므로 404가 맞다.
  if (!Number.isInteger(id) || id < 1 || id > MAX_POST_ID) {
    next(); // 숫자가 아니거나 범위 밖이면 404 핸들러로
    return;
  }

  const post = await getPublishedPost(id);
  if (!post) {
    next();
    return;
  }

  res.render('story/detail', {
    pageTitle: `${post.title} | ${env.SITE_NAME}`,
    pageDescription: post.title,
    ogImage: `${env.SITE_ORIGIN}/uploads/story/${post.mainImage}`,
    post,
  });
};

/** 홈 캐러셀이 fetch하는 JSON */
export const slidesApi: RequestHandler = async (_req, res) => {
  const posts = await listSlides();
  res.json({
    slides: posts.map((post) => ({
      id: post.id,
      title: post.title,
      imageUrl: `/uploads/story/${post.mainImage}`,
      href: `/story/${post.id}`,
    })),
  });
};
