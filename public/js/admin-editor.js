/* 관리자 글 작성/수정용 Quill 에디터 초기화 */
(function () {
  'use strict';

  var editorEl = document.getElementById('editor');
  var contentInput = document.getElementById('content');
  if (!editorEl || !contentInput || typeof Quill === 'undefined') return;

  var quill = new Quill(editorEl, {
    theme: 'snow',
    placeholder: '내용을 입력해주세요. (선택 — 비워두면 대표 이미지만 표시됩니다)',
    modules: {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['link', 'image'],
          ['blockquote'],
          ['clean'],
        ],
        handlers: {
          // 기본 동작(base64 삽입) 대신 서버에 업로드하고 URL을 삽입한다
          image: function () {
            var input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/jpeg,image/png,image/webp');
            input.click();

            input.onchange = function () {
              var file = input.files && input.files[0];
              if (!file) return;

              var formData = new FormData();
              formData.append('image', file);

              fetch('/admin/upload/image', { method: 'POST', body: formData })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                  if (!data.success || !data.url) {
                    window.alert(data.msg || '이미지 업로드에 실패했습니다.');
                    return;
                  }
                  var range = quill.getSelection(true);
                  quill.insertEmbed(range.index, 'image', data.url);
                  quill.setSelection(range.index + 1);
                })
                .catch(function () {
                  window.alert('이미지 업로드 중 오류가 발생했습니다.');
                });
            };
          },
        },
      },
    },
  });

  // 제출 직전에 에디터 내용을 hidden input으로 옮긴다
  var form = editorEl.closest('form');
  if (form) {
    form.addEventListener('submit', function () {
      // 내용이 비어 있으면 Quill은 '<p><br></p>'를 반환하므로 빈 문자열로 정규화한다
      var html = quill.getSemanticHTML().trim();
      contentInput.value = html === '<p></p>' || html === '<p><br></p>' ? '' : quill.root.innerHTML;
    });
  }
})();
