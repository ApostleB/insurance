/* 홈 "이야기" 슬라이드 — 가로 슬라이드 전환 + 자동 순환 + hover/touch 정지 + 스와이프 */
(function () {
  'use strict';

  var AUTO_MS = 5000;          // 자동 전환 간격
  var RESUME_DELAY_MS = 3000;  // 터치 조작 후 재개까지 대기
  var SWIPE_THRESHOLD = 50;    // 스와이프로 인정할 최소 이동 px
  var DIRECTION_LOCK_PX = 8;   // 이 정도 움직여야 가로/세로 방향을 판정한다

  var section = document.getElementById('story-slider');
  if (!section) return;

  var viewport = section.querySelector('[data-slider-viewport]');
  var track = section.querySelector('[data-slider-track]');
  var dotsWrap = section.querySelector('[data-slider-dots]');
  if (!viewport || !track) return;

  // 모션 최소화를 선호하면 전환 애니메이션을 끈다
  var prefersReduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TRANSITION_MS = prefersReduced ? 0 : 450;

  var slides = [];      // 서버에서 받은 원본 슬라이드
  var index = 0;        // 지금 보이는 원본 슬라이드 번호 (0 ~ slides.length-1)
  var pos = 0;          // 트랙 상의 위치 (클론 포함)
  var loop = false;     // 앞뒤에 클론을 둬서 무한 순환하는지
  var timer = null;
  var resumeTimer = null;
  var snapTimer = null;

  // ── 트랙 이동 ────────────────────────────────────────

  /**
   * 트랙을 옮긴다. 페이지가 아니라 트랙만 움직이므로 스크롤이 발생하지 않는다.
   * extraPx는 손가락을 따라가는 드래그 오프셋이다.
   */
  function applyTransform(extraPx, animate) {
    track.style.transition = animate && TRANSITION_MS > 0
      ? 'transform ' + TRANSITION_MS + 'ms cubic-bezier(0.22, 0.61, 0.36, 1)'
      : 'none';
    track.style.transform = 'translate3d(calc(' + (-pos * 100) + '% + ' + extraPx + 'px), 0, 0)';
  }

  /**
   * next번째 원본 슬라이드로 이동한다.
   *
   * loop 모드에서 범위를 벗어나면 끝에 붙여둔 클론까지 이어서 밀어낸 뒤,
   * 전환이 끝나는 시점에 진짜 슬라이드 자리로 소리 없이 되돌린다(scheduleSnap).
   * 이렇게 해야 마지막 → 처음으로 넘어갈 때도 되감기지 않고 같은 방향으로 흐른다.
   */
  function moveTo(next, animate) {
    var n = slides.length;
    if (n === 0) return;

    if (!loop) {
      index = 0;
      pos = 0;
      applyTransform(0, animate);
      syncDots();
      return;
    }

    var toClone = false;
    if (next >= n) {
      index = 0;
      pos = n + 1;   // 맨 뒤 클론(= 첫 슬라이드)
      toClone = true;
    } else if (next < 0) {
      index = n - 1;
      pos = 0;       // 맨 앞 클론(= 마지막 슬라이드)
      toClone = true;
    } else {
      index = next;
      pos = next + 1; // 앞 클론 한 칸만큼 밀려 있다
    }

    applyTransform(0, animate);
    syncDots();
    if (toClone && animate) scheduleSnap();
    else if (toClone) settle();
  }

  /** 클론까지 밀어낸 뒤, 전환이 끝나면 대응하는 진짜 슬라이드 자리로 순간이동한다. */
  function scheduleSnap() {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(function () {
      snapTimer = null;
      settle();
    }, TRANSITION_MS + 30);
  }

  /**
   * 예약된 순간이동을 즉시 반영해 트랙을 정상 위치로 맞춘다.
   * 애니메이션 도중 사용자가 손을 대면 그 자리에서 바로 정리되도록 한다.
   */
  function settle() {
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
    pos = loop ? index + 1 : index;
    applyTransform(0, false);
  }

  function syncDots() {
    if (!dotsWrap) return;
    var dots = dotsWrap.querySelectorAll('[data-dot]');
    for (var i = 0; i < dots.length; i += 1) {
      dots[i].className = i === index
        ? 'h-1.5 w-4 rounded-full bg-white transition-all'
        : 'h-1.5 w-1.5 rounded-full bg-white/50 transition-all';
    }
  }

  // ── DOM 생성 ────────────────────────────────────────

  /**
   * 슬라이드 하나를 만든다.
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
  function buildItem(slide, isClone) {
    var item = document.createElement('a');
    item.href = slide.href;
    item.className = 'slider-item relative block h-full w-full shrink-0';
    if (isClone) {
      // 클론은 같은 글이 두 번 읽히거나 탭 이동에 걸리지 않도록 보조기술에서 숨긴다
      item.setAttribute('aria-hidden', 'true');
      item.tabIndex = -1;
    }

    var img = document.createElement('img');
    img.src = slide.imageUrl;
    img.alt = '';
    img.draggable = false; // 데스크톱에서 이미지 드래그 고스트가 생기지 않게 한다
    img.className = 'h-full w-full select-none object-cover';

    var overlay = document.createElement('div');
    overlay.className = 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5';

    var titleEl = document.createElement('p');
    titleEl.className = 'text-base font-bold text-white';
    titleEl.textContent = slide.title; // textContent이므로 항상 텍스트로만 렌더링된다 (XSS 방지)

    overlay.appendChild(titleEl);
    item.appendChild(img);
    item.appendChild(overlay);
    return item;
  }

  function render() {
    loop = slides.length > 1;
    track.innerHTML = '';

    // loop면 [마지막 클론, 0, 1, ... , n-1, 첫 클론] 순서로 배치한다
    var order = loop
      ? [slides[slides.length - 1]].concat(slides, [slides[0]])
      : slides.slice();

    order.forEach(function (slide, i) {
      var isClone = loop && (i === 0 || i === order.length - 1);
      track.appendChild(buildItem(slide, isClone));
    });

    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      if (loop) {
        slides.forEach(function (_, i) {
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.setAttribute('data-dot', String(i));
          dot.setAttribute('aria-label', (i + 1) + '번째 슬라이드');
          dot.className = 'h-1.5 w-1.5 rounded-full bg-white/50 transition-all';
          dotsWrap.appendChild(dot);
        });
        dotsWrap.addEventListener('click', function (event) {
          var dot = event.target.getAttribute('data-dot');
          if (dot === null) return;
          settle(); // 진행 중인 전환을 정리하고 목표 위치로 간다
          moveTo(Number(dot), true);
          restart();
        });
      }
    }

    // 첫 위치는 애니메이션 없이 잡는다
    index = 0;
    pos = loop ? 1 : 0;
    applyTransform(0, false);
    syncDots();
  }

  // ── 자동 전환 ────────────────────────────────────────

  function start() {
    stop();
    if (slides.length < 2) return; // 1장이면 순환할 이유가 없다
    timer = setInterval(function () { moveTo(index + 1, true); }, AUTO_MS);
  }

  /** 진행 중인 자동 전환만 멈춘다. 예약된 재개(resumeTimer)는 건드리지 않는다. */
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /**
   * 자동 전환을 멈추고 예약된 재개까지 취소한다.
   *
   * 마우스가 슬라이더 위에 올라온 경우처럼, 사용자가 명시적으로 머무는 동안
   * 뒤늦게 예약이 발동해 되살아나는 것을 막을 때 쓴다.
   * 터치 경로에서는 쓰지 않는다 — 터치 기기는 mouseleave가 오지 않아
   * 재개 계기가 사라지면 자동 전환이 영영 멈춘다.
   */
  function stopAndCancelResume() {
    stop();
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  }

  /**
   * 마우스가 지금 슬라이더 위에 올라가 있는지 실제 DOM 상태로 판정한다.
   *
   * 플래그 변수로 추적하지 않는 이유: mouseenter/touchstart로 켜고
   * mouseleave/touchend로 끄는 방식은 짝이 맞지 않으면 영구 고착된다.
   * 실제로 모바일에서 탭하면 브라우저가 합성 mouseenter를 발생시키는데
   * mouseleave는 오지 않아, 자동 전환이 영영 멈추는 문제가 있었다.
   * (touchcancel로 touchend가 유실되는 경우도 마찬가지)
   * 매번 조회하면 상태를 들고 있지 않으므로 고착될 수 없다.
   */
  function isPointerOver() {
    return typeof section.matches === 'function' && section.matches(':hover');
  }

  /**
   * 조작 직후 잠시 멈췄다가 다시 자동 전환을 시작한다.
   *
   * 재개 시점에 마우스가 여전히 슬라이더 위에 있으면 다시 멈춘다.
   * 이렇게 해야 "마우스를 올린 채 도트를 클릭"해도 정지 상태가 유지되면서,
   * 터치 기기에서 플래그가 고착돼 영영 멈추는 일도 없다.
   */
  function restart() {
    stopAndCancelResume();
    resumeTimer = setTimeout(function () {
      resumeTimer = null;
      if (isPointerOver()) return; // 아직 호버 중이면 mouseleave가 재개를 맡는다
      start();
    }, RESUME_DELAY_MS);
  }

  // ── 터치 스와이프 ────────────────────────────────────

  var startX = 0;
  var startY = 0;
  var dragDx = 0;
  var decided = false;  // 가로/세로 방향 판정을 마쳤는지
  var dragging = false; // 가로 드래그로 확정됐는지
  var swiped = false;   // 방금 스와이프였는지 (링크 클릭 억제용)

  function onTouchStart(e) {
    if (slides.length < 2) return;
    var t = e.changedTouches[0];
    startX = t.clientX;
    startY = t.clientY;
    dragDx = 0;
    decided = false;
    dragging = false;
    swiped = false;
    stop();
  }

  /**
   * 가로 드래그로 판정된 순간부터 preventDefault로 브라우저 기본 스크롤을 막는다.
   *
   * 이 처리가 없으면 대각선으로 조금만 스쳐도 브라우저가 페이지를 세로로 끌어
   * "슬라이드하는데 페이지 전체가 스크롤되는" 현상이 생긴다.
   * viewport의 `touch-action: pan-y`가 가로 스크롤 자체를 브라우저에 넘기지
   * 않도록 미리 막아주고, 여기서는 남은 세로 스크롤만 차단한다.
   * preventDefault를 쓰므로 이 리스너만 passive가 아니어야 한다.
   */
  function onTouchMove(e) {
    if (slides.length < 2) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - startX;
    var dy = t.clientY - startY;

    if (!decided) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      decided = true;
      dragging = Math.abs(dx) > Math.abs(dy); // 세로가 우세하면 페이지 스크롤에 양보한다
      if (dragging) settle();
    }
    if (!dragging) return;

    if (e.cancelable) e.preventDefault();
    dragDx = dx;
    applyTransform(dx, false); // 손가락을 따라 트랙만 움직인다
  }

  function onTouchEnd() {
    if (slides.length < 2) return;
    if (dragging) {
      if (Math.abs(dragDx) >= SWIPE_THRESHOLD) {
        swiped = true;
        // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
        moveTo(index + (dragDx < 0 ? 1 : -1), true);
      } else {
        applyTransform(0, true); // 문턱을 못 넘었으면 제자리로 되돌린다
      }
    }
    decided = false;
    dragging = false;
    dragDx = 0;
    restart();
  }

  // ── 초기화 ──────────────────────────────────────────

  fetch('/api/story/slides')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      slides = (data && data.slides) || [];
      // 노출할 글이 없으면 섹션 자체를 숨긴다 (빈 캐러셀 방지)
      if (slides.length === 0) return;

      section.classList.remove('hidden');
      render();
      start();

      // 데스크톱: 마우스를 올리면 멈추고 떼면 다시 돈다.
      // 예약된 재개는 취소하지 않는다 — 재개 콜백이 isPointerOver()로 호버 여부를
      // 다시 확인하므로 호버 중에는 어차피 재개되지 않고, 터치 기기에서
      // 합성 mouseenter가 예약을 지워 영영 멈추는 일도 없다.
      section.addEventListener('mouseenter', stop);
      section.addEventListener('mouseleave', function () {
        // 호버 중 도트를 눌렀다면 재개 예약이 남아 있다. 지우지 않으면
        // 여기서 시작한 순환을 그 예약이 뒤늦게 리셋해 전환이 한 박자 밀린다.
        stopAndCancelResume();
        start();
      });

      // 모바일: 터치 중에는 멈추고, 뗀 뒤 잠시 후 재개한다
      viewport.addEventListener('touchstart', onTouchStart, { passive: true });
      viewport.addEventListener('touchmove', onTouchMove, { passive: false });
      viewport.addEventListener('touchend', onTouchEnd, { passive: true });
      // 전화 수신·시스템 제스처 등으로 touchend가 오지 않는 경우에도 재개되도록 한다
      viewport.addEventListener('touchcancel', onTouchEnd, { passive: true });

      // 스와이프로 끝난 제스처가 링크 이동까지 발동시키지 않게 막는다
      viewport.addEventListener('click', function (event) {
        if (!swiped) return;
        swiped = false;
        event.preventDefault();
      });
    })
    .catch(function () {
      // 슬라이드는 부가 요소이므로 실패해도 페이지 나머지에 영향을 주지 않는다
    });
})();
