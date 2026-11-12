(function () {
  "use strict";

  const mascot = document.createElement("button");
  mascot.id = "resumeMascot";
  mascot.className = "resume-mascot";
  mascot.type = "button";
  mascot.setAttribute("aria-label", "和简历机器人打招呼");
  mascot.innerHTML = `
    <span class="resume-mascot-art" aria-hidden="true">
      <span class="resume-mascot-standing">
        <img src="./assets/resume-mascot.png" width="150" height="150" alt="" draggable="false" />
        <span class="resume-mascot-eye"></span>
        <span class="resume-mascot-eye"></span>
      </span>
    </span>
  `;
  const art = mascot.querySelector(".resume-mascot-art");

  if (document.body.classList.contains("lake-materials")) {
    const readingPose = document.createElement("span");
    readingPose.className = "resume-mascot-reading";
    const reading = new Image(150, 150);
    reading.alt = "";
    reading.draggable = false;
    reading.addEventListener("load", () => mascot.classList.add("has-reading-pose"), { once: true });
    reading.src = "./assets/resume-mascot-reading.png";
    readingPose.append(reading);
    art.append(readingPose);
  }

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const positionKey = "aijob:resume-mascot-position";
  const dragThreshold = 6;
  const viewportMargin = 8;
  let position;
  let drag;
  let suppressPointerClick = false;
  let reaction;

  function moveTo(x, y) {
    const viewport = document.documentElement;
    const maxX = viewport.clientWidth - mascot.offsetWidth - viewportMargin;
    const maxY = viewport.clientHeight - mascot.offsetHeight - viewportMargin;
    position = {
      x: Math.max(viewportMargin, Math.min(x, maxX)),
      y: Math.max(viewportMargin, Math.min(y, maxY)),
    };
    mascot.style.setProperty("--resume-mascot-left", `${position.x}px`);
    mascot.style.setProperty("--resume-mascot-top", `${position.y}px`);
    mascot.classList.add("is-positioned");
  }

  function finishDrag(event) {
    if (drag?.id !== event.pointerId) return;
    if (drag.moved) {
      mascot.classList.remove("is-dragging");
      try {
        sessionStorage.setItem(positionKey, JSON.stringify(position));
      } catch {
        // The robot can still be moved when tab storage is unavailable.
      }
    }
    drag = null;
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(positionKey));
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) moveTo(saved.x, saved.y);
    } catch {
      // Keep the default position if storage is unavailable or has invalid data.
    }
  }

  mascot.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const bounds = mascot.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      moved: false,
    };
    suppressPointerClick = false;
    mascot.setPointerCapture(event.pointerId);
  });

  mascot.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < dragThreshold) return;
      drag.moved = true;
      suppressPointerClick = true;
      reaction?.cancel();
      mascot.classList.add("is-dragging");
    }
    moveTo(drag.left + dx, drag.top + dy);
  });

  mascot.addEventListener("pointerup", finishDrag);
  mascot.addEventListener("pointercancel", finishDrag);
  mascot.addEventListener("lostpointercapture", finishDrag);

  mascot.addEventListener("click", (event) => {
    if (suppressPointerClick && event.detail > 0) return;
    mascot.dispatchEvent(new Event("resume-mascot:activate"));
    if (motionPreference.matches) return;
    reaction?.cancel();
    reaction = art.animate(
      [
        { scale: "1" },
        { scale: "1.07 0.88", offset: 0.27 },
        { scale: "0.98 1.09", offset: 0.62 },
        { scale: "1" },
      ],
      { duration: 350, easing: "ease-out" },
    );
  });

  document.body.append(mascot);
  restorePosition();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) restorePosition();
  });
})();
