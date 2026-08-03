/* 폼 중복 제출 방지 + 전화번호 자동 하이픈 */
(function () {
  'use strict';

  // ── 중복 제출 방지 ─────────────────────────────
  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!form || form.getAttribute('data-guard') !== 'true') return;

      // 이미 제출된 폼이면 재제출 차단
      if (form.getAttribute('data-submitted') === 'true') {
        event.preventDefault();
        return;
      }

      // 브라우저 기본 검증(required 등)을 통과하지 못하면 잠그지 않는다
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;

      var button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        var label = button.querySelector('[data-submit-label]');
        if (label) label.textContent = '전송 중...';
      }
      form.setAttribute('data-submitted', 'true');
    },
    false,
  );

  // ── 전화번호 입력 시 자동 하이픈 ─────────────────
  var phoneInputs = document.querySelectorAll('input[data-phone-format]');
  Array.prototype.forEach.call(phoneInputs, function (input) {
    input.addEventListener('input', function () {
      var digits = input.value.replace(/[^0-9]/g, '').slice(0, 11);
      var formatted = digits;
      if (digits.length > 7) {
        formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
      } else if (digits.length > 3) {
        formatted = digits.slice(0, 3) + '-' + digits.slice(3);
      }
      input.value = formatted;
    });
  });
})();
