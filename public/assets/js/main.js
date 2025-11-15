/**
* Template Name: Mentor
* Template URL: https://bootstrapmade.com/mentor-free-education-bootstrap-theme/
* Updated: Jul 07 2025 with Bootstrap v5.3.7
* Author: BootstrapMade.com
* License: https://bootstrapmade.com/license/
*/

(function () {
  "use strict";

  /**
   * Apply .scrolled class to the body as the page is scrolled down
   */
  function toggleScrolled() {
    const selectBody = document.querySelector("body");
    const selectHeader = document.querySelector("#header");

    if (
      !selectHeader ||
      (!selectHeader.classList.contains("scroll-up-sticky") &&
        !selectHeader.classList.contains("sticky-top") &&
        !selectHeader.classList.contains("fixed-top"))
    ) {
      return;
    }

    if (window.scrollY > 100) {
      selectBody.classList.add("scrolled");
    } else {
      selectBody.classList.remove("scrolled");
    }
  }

  document.addEventListener("scroll", toggleScrolled);
  window.addEventListener("load", toggleScrolled);

  /**
   * Mobile nav toggle
   */
  const mobileNavToggleBtn = document.querySelector(".mobile-nav-toggle");

  function mobileNavToogle() {
    document.querySelector("body").classList.toggle("mobile-nav-active");
    mobileNavToggleBtn.classList.toggle("bi-list");
    mobileNavToggleBtn.classList.toggle("bi-x");
  }
  if (mobileNavToggleBtn) {
    mobileNavToggleBtn.addEventListener("click", mobileNavToogle);
  }

  /**
   * Hide mobile nav on same-page/hash links
   */
  document.querySelectorAll("#navmenu a").forEach((navmenu) => {
    navmenu.addEventListener("click", () => {
      if (document.querySelector(".mobile-nav-active")) {
        mobileNavToogle();
      }
    });
  });

  /**
   * Toggle mobile nav dropdowns
   */
  document
    .querySelectorAll(".navmenu .toggle-dropdown")
    .forEach((navmenu) => {
      navmenu.addEventListener("click", function (e) {
        e.preventDefault();
        this.parentNode.classList.toggle("active");
        this.parentNode.nextElementSibling.classList.toggle("dropdown-active");
        e.stopImmediatePropagation();
      });
    });

  /**
   * Preloader
   */
  const preloader = document.querySelector("#preloader");
  if (preloader) {
    window.addEventListener("load", () => {
      preloader.remove();
    });
  }

  /**
   * Scroll top button
   */
  let scrollTop = document.querySelector(".scroll-top");

  function toggleScrollTop() {
    if (scrollTop) {
      if (window.scrollY > 100) {
        scrollTop.classList.add("active");
      } else {
        scrollTop.classList.remove("active");
      }
    }
  }

  if (scrollTop) {
    scrollTop.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  window.addEventListener("load", toggleScrollTop);
  document.addEventListener("scroll", toggleScrollTop);

  /**
   * Animation on scroll function and init
   */
  function aosInit() {
    if (typeof AOS !== "undefined") {
      AOS.init({
        duration: 600,
        easing: "ease-in-out",
        once: true,
        mirror: false,
      });
    }
  }
  window.addEventListener("load", aosInit);

  /**
   * Initiate glightbox
   */
  if (typeof GLightbox !== "undefined") {
    GLightbox({
      selector: ".glightbox",
    });
  }

  /**
   * Initiate Pure Counter
   */
  if (typeof PureCounter !== "undefined") {
    new PureCounter();
  }

  /**
   * Init swiper sliders
   */
  function initSwiper() {
    if (typeof Swiper === "undefined") return;

    document.querySelectorAll(".init-swiper").forEach(function (swiperElement) {
      const configEl = swiperElement.querySelector(".swiper-config");
      if (!configEl) return;

      let config = {};
      try {
        config = JSON.parse(configEl.innerHTML.trim());
      } catch (e) {
        console.error("Invalid swiper config JSON", e);
        return;
      }

      if (swiperElement.classList.contains("swiper-tab")) {
        // if your template has this helper, it will be used
        if (typeof initSwiperWithCustomPagination === "function") {
          initSwiperWithCustomPagination(swiperElement, config);
        } else {
          new Swiper(swiperElement, config);
        }
      } else {
        new Swiper(swiperElement, config);
      }
    });
  }

  window.addEventListener("load", initSwiper);

  /*--------------------------------------------------------------
  # AI Helper Bubble – toggle + chat with /ai/chat
  --------------------------------------------------------------*/
  function initAiHelper() {
    const container = document.getElementById("ai-helper-container");
    if (!container) return; // page without bubble

    const toggleBtn = document.getElementById("ai-helper-toggle");
    const closeBtn = document.getElementById("ai-helper-close");
    const panel = document.getElementById("ai-helper-panel");
    const form = document.getElementById("ai-helper-form");
    const input = document.getElementById("ai-helper-text");
    const messages = document.getElementById("ai-helper-messages");

    if (!toggleBtn || !panel || !form || !input || !messages) return;

    function addMessage(role, text) {
      const div = document.createElement("div");
      div.classList.add("ai-msg", role === "user" ? "ai-msg-user" : "ai-msg-bot");
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    // Open / close panel with bubble
    toggleBtn.addEventListener("click", () => {
      panel.classList.toggle("d-none");
      if (!panel.classList.contains("d-none")) {
        input.focus();
      }
    });

    // Close with X button
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        panel.classList.add("d-none");
      });
    }

    // Handle sending a question
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      addMessage("user", text);
      input.value = "";

      try {
        const res = await fetch("/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            mode: "explain", // default behaviour
          }),
        });

        const data = await res.json();

        if (data.success && data.data && data.data.explanation) {
          addMessage("bot", data.data.explanation);
        } else if (data.success && data.quiz && Array.isArray(data.quiz.questions)) {
          addMessage(
            "bot",
            `I generated a quiz with ${data.quiz.questions.length} question(s).`
          );
        } else {
          addMessage("bot", data.error || "Sorry, I could not process that.");
        }
      } catch (err) {
        console.error(err);
        addMessage("bot", "Sorry, there was an error talking to the AI.");
      }
    });
  }

  window.addEventListener("load", initAiHelper);
})();
