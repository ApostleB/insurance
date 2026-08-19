import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

/**
 * 게시글 이미지 저장 경로 — 방문자에게 보여줘야 하므로 public 아래에 둔다.
 *
 * `app.ts`의 정적 서빙 루트(`PUBLIC_DIR`)와 **반드시 같은 기준**이어야 한다.
 * 그쪽이 `__dirname` 기반(개발: src/../public, 빌드: dist/../public)이므로 여기도 맞춘다.
 * `process.cwd()`를 쓰면 실행 위치가 프로젝트 루트가 아닐 때
 * 업로드는 성공하는데 정적 서빙 경로와 어긋나 이미지가 조용히 깨진다.
 */
export const STORY_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'story');

fs.mkdirSync(STORY_UPLOAD_DIR, { recursive: true });

/**
 * 허용 MIME과 확장자 매핑.
 * 저장 파일명의 확장자는 원본이 아니라 이 표에서 가져온다 —
 * 원본 확장자를 신뢰하면 이중 확장자(a.jpg.html) 같은 우회가 가능하다.
 */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

class UploadValidationError extends Error {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, STORY_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // 저장 파일명은 UUID로 재생성 — 경로 조작(path traversal) 차단
    const ext = ALLOWED[file.mimetype]?.[0] ?? '.bin';
    cb(null, `${randomUUID()}${ext}`);
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** multer가 던진 에러 — 컨트롤러가 폼에 표시하기 위해 여기 담는다 */
      uploadError?: unknown;
    }
  }
}

const createUploader = (fieldName: string): RequestHandler =>
  multer({
    storage,
    limits: { fileSize: env.MAX_IMAGE_SIZE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const allowedExts = ALLOWED[file.mimetype];
      if (!allowedExts) {
        cb(new UploadValidationError('JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.'));
        return;
      }
      // MIME과 확장자를 모두 확인한다 (이중 검증)
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExts.includes(ext)) {
        cb(new UploadValidationError('파일 형식과 확장자가 일치하지 않습니다.'));
        return;
      }
      cb(null, true);
    },
  }).single(fieldName);

/**
 * multer 에러를 즉시 던지지 않고 req에 담아 다음 미들웨어로 넘긴다.
 * 그래야 컨트롤러가 사용자 입력값을 유지한 채 폼을 다시 그릴 수 있다.
 * (에러를 그대로 던지면 글로벌 에러 핸들러로 가서 입력 내용이 전부 날아간다)
 */
const captureUploadError =
  (uploader: RequestHandler): RequestHandler =>
  (req, res, next) => {
    uploader(req, res, (err: unknown) => {
      if (err) req.uploadError = err;
      next();
    });
  };

// 래핑된 것만 export한다 — 원본을 라우터에 직접 붙이면 위 문제가 발생한다
export const uploadMainImageSafe = captureUploadError(createUploader('mainImage'));
export const uploadEditorImageSafe = captureUploadError(createUploader('image'));

/** multer 에러를 사용자에게 보여줄 한국어 메시지로 변환한다. 업로드 에러가 아니면 null. */
export function toUploadError(error: unknown): string | null {
  if (error instanceof UploadValidationError) return error.message;
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return `이미지 크기는 최대 ${env.MAX_IMAGE_SIZE_MB}MB까지 업로드할 수 있습니다.`;
    }
    return '이미지 업로드에 실패했습니다.';
  }
  return null;
}
