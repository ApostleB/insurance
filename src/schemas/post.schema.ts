import { z } from 'zod';

/** 체크박스는 체크 시 'on'을 보내고 미체크 시 아예 전송되지 않는다. */
const checkbox = z.preprocess(
  (value) => value === 'on' || value === 'true' || value === true,
  z.boolean(),
);

/** 빈 문자열을 undefined로 (선택 입력 필드용) */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const postSchema = z.object({
  title: z
    .string({ required_error: '제목을 입력해주세요.' })
    .trim()
    .min(2, '제목은 2자 이상 입력해주세요.')
    .max(200, '제목은 200자 이하로 입력해주세요.'),

  content: z
    .string({ required_error: '내용을 입력해주세요.' })
    .trim()
    .min(1, '내용을 입력해주세요.'),

  sourceUrl: z.preprocess(
    emptyToUndefined,
    z.string().url('올바른 URL 형식이 아닙니다. (http:// 또는 https://로 시작)').max(500).optional(),
  ),

  isPinned: checkbox,
  showOnHome: checkbox,
  isPublished: checkbox,
});

/** req.body 타입은 별도 인터페이스 없이 zod에서 추론한다. */
export type PostInput = z.infer<typeof postSchema>;
