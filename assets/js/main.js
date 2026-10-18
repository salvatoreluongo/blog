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
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1600);
  }
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = b.dataset.copy; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e2) {}
        ta.remove();
      }
      b.classList.add("ok");
      toast("Link copiato!");
      setTimeout(() => b.classList.remove("ok"), 1600);
    })
  );

  // Tema chiaro/scuro (sole ⇆ luna). Se non è stato scelto, segue il sistema.
  const root = document.documentElement;
  const themeBtn = document.getElementById("theme-toggle");
  const prefersDark = () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const currentTheme = () => root.getAttribute("data-theme") || (prefersDark() ? "dark" : "light");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("tema", next); } catch (e) {}
    });
  }

  // Pagina Categorie: mostra solo la categoria selezionata
  const catFilter = document.getElementById("cat-filter");
  if (catFilter) {
    const sections = Array.prototype.slice.call(document.querySelectorAll(".cat-section"));
    const pills = Array.prototype.slice.call(catFilter.querySelectorAll("[data-cat]"));
    const applyCat = (cat) => {
      const all = !cat || cat === "all";
      sections.forEach((s) => { s.style.display = (all || s.dataset.cat === cat) ? "" : "none"; });
      pills.forEach((p) => p.classList.toggle("active", p.dataset.cat === (all ? "all" : cat)));
    };
    const fromHash = () => (location.hash || "").replace("#", "");
    applyCat(fromHash());
    window.addEventListener("hashchange", () => applyCat(fromHash()));
    pills.forEach((p) => p.addEventListener("click", (e) => {
      const cat = p.dataset.cat;
      if (cat === "all") { e.preventDefault(); if (location.hash) history.replaceState(null, "", location.pathname + location.search); applyCat("all"); }
      else { applyCat(cat); }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  // Modulo di contatto (Web3Forms): invio senza ricaricare la pagina
  document.querySelectorAll(".cform").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector(".cform-msg");
      const btn = form.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      if (msg) { msg.className = "cform-msg"; msg.textContent = "Invio in corso…"; }
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          form.reset();
          if (msg) { msg.textContent = "Messaggio inviato, grazie! Ti rispondo al più presto."; msg.classList.add("ok"); }
        } else {
          if (msg) { msg.textContent = (data && data.message) ? data.message : "Qualcosa è andato storto. Riprova."; msg.classList.add("err"); }
        }
      } catch (err) {
        if (msg) { msg.textContent = "Errore di rete, riprova più tardi."; msg.classList.add("err"); }
      } finally {
        if (btn) btn.disabled = false;
        if (window.hcaptcha) { try { window.hcaptcha.reset(); } catch (e2) {} }
      }
    });
  });
})();
