import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { toFieldErrors, type FieldErrors } from '../schemas/common';
import { postSchema } from '../schemas/post.schema';
import { STORY_UPLOAD_DIR, toUploadError } from '../middlewares/upload';
import {
  createPost,
  deletePost,
  getPost,
  listAllPosts,
  movePost,
  updatePost,
} from '../services/post.service';

interface FormValues {
  title: string;
  content: string;
  sourceUrl: string;
  isPinned: boolean;
  showOnHome: boolean;
  isPublished: boolean;
  mainImage: string;
}

const EMPTY_VALUES: FormValues = {
  title: '',
  content: '',
  sourceUrl: '',
  isPinned: false,
  showOnHome: false,
  isPublished: true,
  mainImage: '',
};

const pickValues = (body: Request['body'], mainImage = ''): FormValues => ({
  title: typeof body?.title === 'string' ? body.title : '',
  content: typeof body?.content === 'string' ? body.content : '',
  sourceUrl: typeof body?.sourceUrl === 'string' ? body.sourceUrl : '',
  isPinned: body?.isPinned === 'on',
  showOnHome: body?.showOnHome === 'on',
  isPublished: body?.isPublished === 'on',
  mainImage,
});

const renderForm = (
  res: Response,
  options: {
    mode: 'create' | 'edit';
    id?: number;
    values?: FormValues;
    errors?: FieldErrors;
    formError?: string | null;
    status?: number;
  },
): void => {
  res.status(options.status ?? 200).render('admin/form', {
    pageTitle: `${options.mode === 'create' ? '글 작성' : '글 수정'} | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    mode: options.mode,
    postId: options.id ?? null,
    values: options.values ?? EMPTY_VALUES,
    errors: options.errors ?? {},
    formError: options.formError ?? null,
  });
};

/** 업로드된 파일을 지운다. 이미 없으면 조용히 넘어간다. */
const removeUpload = async (fileName: string): Promise<void> => {
  if (!fileName) return;
  try {
    // 파일명만 취해 경로 조작을 막는다
    await fs.unlink(path.join(STORY_UPLOAD_DIR, path.basename(fileName)));
  } catch {
    // 파일이 이미 없는 경우는 무시
  }
};

// ── 목록 ────────────────────────────────────────────

export const renderAdminList: RequestHandler = async (_req, res) => {
  const posts = await listAllPosts();
  res.render('admin/list', {
    pageTitle: `게시글 관리 | ${env.SITE_NAME}`,
    pageDescription: '관리자 전용 페이지입니다.',
    posts,
  });
};

// ── 작성 ────────────────────────────────────────────

export const renderCreateForm: RequestHandler = (_req, res) => {
  renderForm(res, { mode: 'create' });
};

export const submitCreate: RequestHandler = async (req, res) => {
  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    renderForm(res, {
      mode: 'create',
      status: 400,
      values: pickValues(req.body),
      formError: uploadError,
    });
    return;
  }

  const parsed = postSchema.safeParse(req.body);
  const fileName = req.file?.filename ?? '';

  if (!parsed.success || !fileName) {
    // 검증 실패 시 이미 올라간 파일을 지워 고아 파일을 만들지 않는다
    await removeUpload(fileName);
    renderForm(res, {
      mode: 'create',
      status: 400,
      values: pickValues(req.body),
      errors: parsed.success ? {} : toFieldErrors(parsed.error),
      formError: fileName ? null : '대표 이미지를 첨부해주세요.',
    });
    return;
  }

  await createPost({ ...parsed.data, mainImage: fileName });
  res.redirect('/admin/story');
};

// ── 수정 ────────────────────────────────────────────

export const renderEditForm: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const post = Number.isInteger(id) ? await getPost(id) : null;
  if (!post) {
    next();
    return;
  }

  renderForm(res, {
    mode: 'edit',
    id: post.id,
    values: {
      title: post.title,
      content: post.content,
      sourceUrl: post.sourceUrl ?? '',
      isPinned: post.isPinned,
      showOnHome: post.showOnHome,
      isPublished: post.isPublished,
      mainImage: post.mainImage,
    },
  });
};

export const submitEdit: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const existing = Number.isInteger(id) ? await getPost(id) : null;
  if (!existing) {
    next();
    return;
  }

  const newFileName = req.file?.filename ?? '';

  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    renderForm(res, {
      mode: 'edit',
      id,
      status: 400,
      values: pickValues(req.body, existing.mainImage),
      formError: uploadError,
    });
    return;
  }

  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    await removeUpload(newFileName);
    renderForm(res, {
      mode: 'edit',
      id,
      status: 400,
      values: pickValues(req.body, existing.mainImage),
      errors: toFieldErrors(parsed.error),
    });
    return;
  }

  await updatePost(id, {
    ...parsed.data,
    ...(newFileName ? { mainImage: newFileName } : {}),
  });

  // 새 이미지로 교체했다면 이전 파일을 정리한다
  if (newFileName) await removeUpload(existing.mainImage);

  res.redirect('/admin/story');
};

// ── 삭제 / 순서 ─────────────────────────────────────

export const submitDelete: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const post = Number.isInteger(id) ? await getPost(id) : null;
  if (!post) {
    next();
    return;
  }

  await deletePost(id);
  // 대표 이미지만 삭제한다. 본문 이미지는 스펙상 의도적으로 남긴다.
  await removeUpload(post.mainImage);
  res.redirect('/admin/story');
};

export const submitMove: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  const direction = req.params.direction === 'up' ? 'up' : 'down';
  if (Number.isInteger(id)) await movePost(id, direction);
  res.redirect('/admin/story');
};

/** 목록에서 게시/고정/홈노출을 즉시 토글한다. */
export const submitToggle: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  const field = req.params.field;
  const post = Number.isInteger(id) ? await getPost(id) : null;

  if (!post || !['isPinned', 'showOnHome', 'isPublished'].includes(field ?? '')) {
    next();
    return;
  }

  const key = field as 'isPinned' | 'showOnHome' | 'isPublished';
  await updatePost(id, {
    title: post.title,
    content: post.content,
    sourceUrl: post.sourceUrl ?? undefined,
    isPinned: post.isPinned,
    showOnHome: post.showOnHome,
    isPublished: post.isPublished,
    [key]: !post[key],
  });

  res.redirect('/admin/story');
};

// ── 에디터 이미지 업로드 (JSON 응답) ────────────────

export const uploadImageApi: RequestHandler = (req, res) => {
  const uploadError = toUploadError(req.uploadError);
  if (uploadError) {
    res.status(400).json({ success: false, msg: uploadError });
    return;
  }
  if (!req.file) {
    res.status(400).json({ success: false, msg: '이미지를 선택해주세요.' });
    return;
  }
  res.json({ success: true, url: `/uploads/story/${req.file.filename}` });
};
