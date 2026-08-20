/* 홈 "이야기" 슬라이드 — 가로 슬라이드 전환 + 자동 순환 + hover/touch 정지 + 스와이프 */
(function () {
  'use strict';

  var AUTO_MS = 5000;          // 자동 전환 간격
  var RESUME_DELAY_MS = 3000;  // 터치 조작 후 재개까지 대기
  var SWIPE_THRESHOLD = 50;    // 스와이프로 인정할 최소 이동 px
  var DIRECTION_LOCK_PX = 8;   // 이 정도 움직여야 가로/세로 방향을 판정한다
  var SYNTHETIC_MOUSE_MS = 700; // 터치 직후 브라우저가 만들어내는 합성 마우스 이벤트를 무시할 시간

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

  /** 마우스처럼 정밀한 포인터가 있는 기기인지. 화살표 버튼은 여기서만 만든다. */
  var hasFinePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
   * extraPx는 손가락/커서를 따라가는 드래그 오프셋이다.
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

  /** 화살표·도트·키보드가 공통으로 쓰는 이동. 진행 중인 전환을 먼저 정리한다. */
  function go(delta) {
    if (slides.length < 2) return;
    settle();
    moveTo(index + delta, true);
    restart();
  }

  function syncDots() {
    if (!dotsWrap) return;
    // 눈에 보이는 막대는 버튼 안쪽 span이다 (버튼 자체는 히트 영역이라 더 크다)
    var bars = dotsWrap.querySelectorAll('[data-dot-bar]');
    for (var i = 0; i < bars.length; i += 1) {
      bars[i].className = i === index
        ? 'block h-1.5 w-4 rounded-full bg-white transition-all'
        : 'block h-1.5 w-1.5 rounded-full bg-white/50 transition-all';
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
    item.className = 'slider-item relative block h-full w-full shrink-0 select-none';
    // <a>는 기본적으로 드래그 가능하다. 끄지 않으면 데스크톱에서 잡는 순간
    // 브라우저가 네이티브 링크 드래그를 시작해 슬라이드가 커서를 따라오지 않는다.
    item.draggable = false;
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
    overlay.className = 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pb-8';

    var titleEl = document.createElement('p');
    titleEl.className = 'text-base font-bold text-white';
    titleEl.textContent = slide.title; // textContent이므로 항상 텍스트로만 렌더링된다 (XSS 방지)

    overlay.appendChild(titleEl);
    item.appendChild(img);
    item.appendChild(overlay);
    return item;
  }

  /**
   * 이전/다음 화살표를 만든다.
   *
   * 터치 기기에는 스와이프가 있어 화면만 가리므로 정밀 포인터 기기에서만 만든다.
   * 데스크톱에는 스와이프를 알려줄 방법이 없어서, 눈에 보이는 컨트롤이 없으면
   * 사용자 입장에서는 조작할 수단이 아예 없는 것과 같다.
   */
  function buildArrow(dir) {
    var isPrev = dir === 'prev';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', isPrev ? '이전 슬라이드' : '다음 슬라이드');
    btn.className = 'absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center '
      + 'rounded-full bg-black/35 text-white opacity-70 backdrop-blur-sm transition '
      + 'hover:bg-black/60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white '
      + (isPrev ? 'left-3' : 'right-3');

    // 아이콘도 innerHTML 조립 없이 DOM으로 만든다
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'h-5 w-5');
    svg.setAttribute('aria-hidden', 'true');
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', isPrev ? '15 5 8 12 15 19' : '9 5 16 12 9 19');
    svg.appendChild(line);
    btn.appendChild(svg);

    btn.addEventListener('click', function () { go(isPrev ? -1 : 1); });
    return btn;
  }

  function buildDot(i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('data-dot', String(i));
    dot.setAttribute('aria-label', (i + 1) + '번째 슬라이드');
    // 버튼은 커서/손가락이 닿을 만큼 키우고, 보이는 막대는 안쪽 span이 그린다.
    // 예전엔 버튼 자체가 6px이라 데스크톱에서 사실상 누를 수 없었다.
    dot.className = 'flex h-6 w-5 items-center justify-center focus:outline-none';
    var bar = document.createElement('span');
    bar.setAttribute('data-dot-bar', '');
    bar.className = 'block h-1.5 w-1.5 rounded-full bg-white/50 transition-all';
    dot.appendChild(bar);
    return dot;
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
        slides.forEach(function (_, i) { dotsWrap.appendChild(buildDot(i)); });
        dotsWrap.addEventListener('click', function (event) {
          // 막대(span)가 클릭될 수 있으므로 버튼까지 거슬러 올라가 찾는다
          var btn = event.target && event.target.closest
            ? event.target.closest('[data-dot]')
            : null;
          if (!btn) return;
          go(Number(btn.getAttribute('data-dot')) - index);
        });
      }
    }

    if (loop && hasFinePointer) {
      viewport.appendChild(buildArrow('prev'));
      viewport.appendChild(buildArrow('next'));
      viewport.style.cursor = 'grab'; // 끌 수 있다는 걸 커서로도 알린다
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

  // ── 드래그 (터치·마우스 공용) ────────────────────────

  var startX = 0;
  var startY = 0;
  var dragDx = 0;
  var decided = false;   // 가로/세로 방향 판정을 마쳤는지
  var dragging = false;  // 가로 드래그로 확정됐는지
  var swiped = false;    // 방금 스와이프였는지 (링크 클릭 억제용)
  var lastTouchAt = 0;   // 터치가 만들어낸 합성 마우스 이벤트를 걸러내기 위한 시각

  /** 드래그를 시작할 공통 상태를 잡는다. */
  function beginDrag(x, y) {
    startX = x;
    startY = y;
    dragDx = 0;
    decided = false;
    dragging = false;
    swiped = false;
    stop();
  }

  /**
   * 드래그를 마무리한다. 문턱을 넘겼으면 넘기고, 못 넘겼으면 제자리로 되돌린다.
   * 터치와 마우스가 같은 판정을 쓰도록 한 곳에 모아둔다.
   */
  function finishDrag() {
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

  // ── 터치 스와이프 ────────────────────────────────────

  function onTouchStart(e) {
    if (slides.length < 2) return;
    lastTouchAt = Date.now();
    var t = e.changedTouches[0];
    beginDrag(t.clientX, t.clientY);
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
    lastTouchAt = Date.now();
    finishDrag();
  }

  // ── 마우스 드래그 (데스크톱) ─────────────────────────

  /**
   * 데스크톱에는 touch 이벤트가 아예 오지 않는다(maxTouchPoints: 0).
   * 터치 경로만 있으면 PC에서는 드래그·스와이프가 전부 무반응이라
   * 사실상 조작할 방법이 없어진다. 같은 드래그 상태 기계에 마우스를 물린다.
   *
   * 세로 판정을 두지 않는 이유: 마우스 드래그는 페이지 스크롤과 경쟁하지 않으므로
   * 가로로 움직였는지만 보면 충분하고, 그 편이 더 예측 가능하다.
   */
  function onMouseDown(e) {
    if (slides.length < 2) return;
    if (e.button !== 0) return;                              // 좌클릭만
    if (Date.now() - lastTouchAt < SYNTHETIC_MOUSE_MS) return; // 터치가 만든 합성 이벤트 무시

    beginDrag(e.clientX, e.clientY);
    // 텍스트 선택과 네이티브 링크 드래그를 막는다
    e.preventDefault();
    viewport.style.cursor = 'grabbing';
    // 커서가 슬라이더 밖으로 나가도 드래그가 이어지도록 window에 건다
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    var dx = e.clientX - startX;
    if (!decided) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX) return;
      decided = true;
      dragging = true;
      settle();
    }
    dragDx = dx;
    applyTransform(dx, false); // 커서를 따라 트랙만 움직인다
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    viewport.style.cursor = 'grab';
    finishDrag();
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

      // 데스크톱: 마우스로 끌어서 넘긴다
      viewport.addEventListener('mousedown', onMouseDown);
      // 드래그가 네이티브 이미지/링크 드래그로 새는 것을 한 번 더 막는다
      viewport.addEventListener('dragstart', function (event) { event.preventDefault(); });

      // 키보드: 슬라이더 안에 포커스가 있을 때 ←/→ 로 넘긴다
      section.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      });

      // 스와이프/드래그로 끝난 제스처가 링크 이동까지 발동시키지 않게 막는다
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
