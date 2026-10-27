(function () {
  "use strict";

  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  function activateTab(nextTab) {
    const target = nextTab.dataset.tab;

    tabs.forEach((tab) => {
      const selected = tab === nextTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    panels.forEach((panel) => {
      const active = panel.dataset.panel === target;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = null;

      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      activateTab(tabs[nextIndex]);
      tabs[nextIndex].focus();
    });
  });

  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const initialTab = tabs.find((tab) => tab.dataset.tab === requestedTab);
  if (initialTab) {
    activateTab(initialTab);
  }
})();
