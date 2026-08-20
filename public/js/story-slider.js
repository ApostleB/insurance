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
      var touchStartX = 0;
      section.addEventListener('touchstart', function (e) {
        stop();
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      section.addEventListener('touchend', function (e) {
        var deltaX = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
          // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
          show(deltaX < 0 ? index + 1 : index - 1);
        }
        restart();
      }, { passive: true });

      // 전화 수신·시스템 제스처 등으로 touchend가 오지 않는 경우에도 재개되도록 한다
      section.addEventListener('touchcancel', restart, { passive: true });
    })
    .catch(function () {
      // 슬라이드는 부가 요소이므로 실패해도 페이지 나머지에 영향을 주지 않는다
    });
})();
