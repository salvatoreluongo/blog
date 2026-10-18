// Barra di lettura, menu, pulsante "torna su" e copia link
(function () {
  const bar = document.getElementById("progress-bar");
  const article = document.getElementById("article");
  const toTop = document.getElementById("to-top");

  function onScroll() {
    const y = window.scrollY;
    if (bar) {
      let p;
      if (article) {
        // avanzamento calcolato sull'articolo, non su tutta la pagina
        const start = article.offsetTop;
        const end = start + article.offsetHeight - window.innerHeight;
        p = end > start ? (y - start) / (end - start) : 1;
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        p = max > 0 ? y / max : 0;
      }
      bar.style.width = Math.min(100, Math.max(0, p * 100)) + "%";
    }
    if (toTop) toTop.classList.toggle("show", y > 600);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  if (toTop) toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // Menu a tutto schermo
  const menu = document.getElementById("menu");
  const btn = document.getElementById("menu-btn");
  const close = document.getElementById("menu-close");
  function setMenu(open) {
    if (!menu) return;
    menu.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    btn && btn.setAttribute("aria-expanded", String(open));
  }
  btn && btn.addEventListener("click", () => setMenu(true));
  close && close.addEventListener("click", () => setMenu(false));
  menu && menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // Copia il link dell'articolo
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) {}
      b.classList.add("ok");
      setTimeout(() => b.classList.remove("ok"), 1500);
    })
  );
})();
