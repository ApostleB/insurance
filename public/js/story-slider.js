/* 홈 "이야기" 슬라이드 — 자동 순환 + hover/touch 정지 + 스와이프 */
(function () {
  'use strict';

  var AUTO_MS = 5000;          // 자동 전환 간격
  var RESUME_DELAY_MS = 3000;  // 터치 조작 후 재개까지 대기
  var SWIPE_THRESHOLD = 50;    // 스와이프로 인정할 최소 이동 px

  var section = document.getElementById('story-slider');
  if (!section) return;

  var track = section.querySelector('[data-slider-track]');
  var dotsWrap = section.querySelector('[data-slider-dots]');
  if (!track) return;

  var slides = [];
  var index = 0;
  var timer = null;
  var resumeTimer = null;
  /** 마우스를 올려두었거나 손가락을 대고 있는 동안 true — 이때는 자동 전환을 재개하지 않는다 */
  var isInteracting = false;

  /**
   * 슬라이드/점 DOM을 그린다.
   *
   * 주의(XSS): slide.title은 관리자가 입력하지만 저장 시점에 sanitize되는 대상이 아니다
   * (sanitize는 본문 content에만 적용된다. src/services/sanitize.service.ts 및
   * src/services/post.service.ts의 createPost/updatePost 참고 — title은 그대로 저장됨).
   * 따라서 innerHTML 문자열 조립으로 title을 넣으면 <script>나
   * <img onerror=...> 같은 페이로드가 그대로 실행되는 XSS가 된다.
   * DOM 노드를 직접 만들고 textContent로만 채워 어떤 문자열이 와도
   * 마크업으로 해석되지 않게 한다. href/imageUrl은 서버가 id/파일명으로
   * 직접 구성한 값이라 위험도는 낮지만, 동일한 이유로 innerHTML 조립 대신
   * 속성 대입(.href/.src)으로 안전하게 넣는다.
   */
  function render() {
    track.innerHTML = '';
    slides.forEach(function (slide) {
      var item = document.createElement('a');
      item.href = slide.href;
      item.className = 'slider-item absolute inset-0 block opacity-0 transition-opacity duration-500';

      var img = document.createElement('img');
      img.src = slide.imageUrl;
      img.alt = '';
      img.className = 'h-full w-full object-cover';

      var overlay = document.createElement('div');
      overlay.className = 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5';

      var titleEl = document.createElement('p');
      titleEl.className = 'text-base font-bold text-white';
      titleEl.textContent = slide.title; // textContent이므로 항상 텍스트로만 렌더링된다 (XSS 방지)

      overlay.appendChild(titleEl);
      item.appendChild(img);
      item.appendChild(overlay);
      track.appendChild(item);
    });

    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      slides.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('data-dot', String(i));
        dot.setAttribute('aria-label', (i + 1) + '번째 슬라이드');
        dot.className = 'h-1.5 w-1.5 rounded-full bg-white/50 transition';
        dotsWrap.appendChild(dot);
      });
      dotsWrap.addEventListener('click', function (event) {
        var dot = event.target.getAttribute('data-dot');
        if (dot === null) return;
        show(Number(dot));
        restart();
      });
    }

    show(0);
  }

  function show(next) {
    // 마지막 다음은 처음으로, 처음 이전은 마지막으로 순환한다
    index = (next + slides.length) % slides.length;
    var items = track.querySelectorAll('.slider-item');
    for (var i = 0; i < items.length; i += 1) {
      items[i].style.opacity = i === index ? '1' : '0';
      items[i].style.zIndex = i === index ? '1' : '0';
    }
    if (dotsWrap) {
      var dots = dotsWrap.querySelectorAll('[data-dot]');
      for (var j = 0; j < dots.length; j += 1) {
        dots[j].className = j === index
          ? 'h-1.5 w-4 rounded-full bg-white transition'
          : 'h-1.5 w-1.5 rounded-full bg-white/50 transition';
      }
    }
  }

  function start() {
    stop();
    if (slides.length < 2) return; // 1장이면 순환할 이유가 없다
    timer = setInterval(function () { show(index + 1); }, AUTO_MS);
  }

  /**
   * 자동 전환을 멈춘다.
   *
   * 예약된 재개 타이머(resumeTimer)도 함께 취소한다.
   * 이걸 남겨두면 정지 상태인데도 예약된 start가 뒤늦게 발동해 되살아난다.
   */
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }

  /**
   * 조작 직후 잠시 멈췄다가 다시 자동 전환을 시작한다.
   *
   * 단, 사용자가 아직 슬라이더를 만지고 있으면(마우스를 올려둔 채이거나
   * 손가락을 대고 있으면) 재개를 예약하지 않는다.
   * 예약해버리면 "마우스를 올린 채 도트를 클릭"했을 때 정지 상태여야 하는데도
   * 몇 초 뒤 슬라이드가 넘어가 버린다.
   */
  function restart() {
    stop();
    if (isInteracting) return; // 포인터를 떼는 시점(mouseleave/touchend)에 재개된다
    resumeTimer = setTimeout(start, RESUME_DELAY_MS);
  }

  fetch('/api/story/slides')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      slides = (data && data.slides) || [];
      // 노출할 글이 없으면 섹션 자체를 숨긴다 (빈 캐러셀 방지)
      if (slides.length === 0) return;

      section.classList.remove('hidden');
      render();
      start();

      // 데스크톱: 마우스를 올리면 멈추고 떼면 다시 돈다
      section.addEventListener('mouseenter', function () {
        isInteracting = true;
        stop();
      });
      section.addEventListener('mouseleave', function () {
        isInteracting = false;
        start();
      });

      // 모바일: 터치 중에는 멈추고, 뗀 뒤 잠시 후 재개한다
      var touchStartX = 0;
      section.addEventListener('touchstart', function (e) {
        isInteracting = true;
        stop();
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      section.addEventListener('touchend', function (e) {
        isInteracting = false;
        var deltaX = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
          // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
          show(deltaX < 0 ? index + 1 : index - 1);
        }
        restart();
      }, { passive: true });
    })
    .catch(function () {
      // 슬라이드는 부가 요소이므로 실패해도 페이지 나머지에 영향을 주지 않는다
    });
})();
