import sanitizeHtml from 'sanitize-html';

/**
 * 게시글 본문 HTML sanitize.
 *
 * 본문은 상세 페이지에서 EJS `<%- %>`로 이스케이프 없이 출력해야 서식이 살아난다.
 * 이는 저장형 XSS의 전형적인 경로이므로, 저장 시점에 서버에서 반드시 걸러낸다.
 * 관리자만 글을 쓰지만 세션 탈취나 외부 HTML 붙여넣기를 대비한 방어다.
 */
export function sanitizePostContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'u', 's', 'blockquote',
      'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img', 'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      span: ['class', 'style'],
      div: ['class', 'style'],
      p: ['class', 'style'],
      li: ['class'],
    },
    // javascript: 스킴 차단. 이미지는 우리 서버 업로드분만 허용한다.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    // style 속성은 Quill이 정렬·크기 지정에 쓰므로 최소한만 허용
    allowedStyles: {
      '*': {
        'text-align': [/^left$|^right$|^center$|^justify$/],
        width: [/^\d+(?:px|%)$/],
        height: [/^\d+(?:px|%)$/],
      },
    },
    // 외부 링크는 새 창 + rel 보안 속성 강제
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}
