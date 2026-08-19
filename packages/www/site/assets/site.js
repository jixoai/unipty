/*
 * UniPty site behavior — progressive enhancement only.
 * No backend imports, no PTY operations, no evidence computation: this site
 * renders static documentation (see docs.html#browser-limits).
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  function reflect() {
    if (toggle) {
      toggle.setAttribute(
        "aria-pressed",
        root.classList.contains("dark") ? "true" : "false",
      );
    }
  }

  if (toggle) {
    reflect();
    toggle.addEventListener("click", function () {
      var dark = root.classList.toggle("dark");
      try {
        localStorage.setItem("unipty-theme", dark ? "dark" : "light");
      } catch (e) {
        /* storage unavailable; session-only theme */
      }
      reflect();
    });
  }

  // Copy buttons on code blocks (enhancement; clipboard may be unavailable).
  document.querySelectorAll("pre.code").forEach(function (pre) {
    if (!navigator.clipboard) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "copy";
    button.setAttribute("aria-label", "Copy code to clipboard");
    button.addEventListener("click", function () {
      navigator.clipboard
        .writeText(pre.querySelector("code").textContent)
        .then(
          function () {
            button.textContent = "copied";
            setTimeout(function () {
              button.textContent = "copy";
            }, 1200);
          },
          function () {
            button.textContent = "failed";
            setTimeout(function () {
              button.textContent = "copy";
            }, 1200);
          },
        );
    });
    pre.appendChild(button);
  });
})();
