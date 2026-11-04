/* Crewforthat live listings feed for Webflow (cards rendered client-side from the public API; CMS list is the no-JS fallback). */
(function () {
  var API = "https://archangel-leadgen.vercel.app/api/public/";
  var PAGES = { "/opportunities": { tab: "jobs_now", noun: "public opportunities" }, "/future-contracts": { tab: "upcoming", noun: "future contracts" },
    "/find-buyers": { tab: "buyers", noun: "possible buyers" }, "/contractor-directory": { dir: true, noun: "directory listings" } };
  var cfg = PAGES[location.pathname.replace(/\/$/, "")]; if (!cfg) return;
  var url = new URLSearchParams(location.search);
  var ref = url.get("ref"); try { if (ref) localStorage.setItem("cft_ref", ref); else ref = localStorage.getItem("cft_ref"); } catch (e) {}
  function withRef(u) { if (!u || !ref) return u; try { var x = new URL(u); x.searchParams.set("ref", ref); return x.toString(); } catch (e) { return u; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function a(cls, href, text, ext) { var n = el("a", cls, text); n.href = href; if (ext) { n.target = "_blank"; n.rel = "noopener nofollow"; } return n; }
  function fmt(d) { if (!d) return null; var t = Date.parse(d); return isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null; }
  function init() {
    var section = document.querySelector(".ol-list");
    if (!section) { section = el("section", "ol-list"); section.id = "approved-jobs"; (document.querySelector("main") || document.body).appendChild(section); }
    var wrap = section.querySelector(".w-dyn-list"); if (!wrap) { wrap = el("div", "w-dyn-list"); section.appendChild(wrap); }
    var cms = wrap.querySelector(".w-dyn-items, .w-dyn-empty");
    var list = el("div", "w-dyn-items cft-feed-items"); list.setAttribute("role", "list"); list.setAttribute("aria-live", "polite");
    var status = el("div", "cft-search__empty"); status.hidden = true;
    var more = el("button", "cft-search__clear cft-feed-more", "Load more"); more.type = "button"; more.hidden = true; more.style.margin = "26px auto 0"; more.style.display = "block";
    var q = document.getElementById("cft-jobs-query"), trade = document.getElementById("cft-jobs-trade"), count = document.getElementById("cft-jobs-count"), sort = document.getElementById("cft-jobs-sort");
    var oldEmpty = document.getElementById("cft-jobs-no-match"), form = document.getElementById("cft-jobs-filter-form"), clear = document.getElementById("cft-jobs-clear");
    if (q && url.get("q")) q.value = url.get("q");
    if (trade && url.get("trade")) { var tv = url.get("trade").replace(/_/g, " ").toLowerCase(); if (![].some.call(trade.options, function (o) { return o.value === tv; })) { var o = el("option", null, tv); o.value = tv; trade.appendChild(o); } trade.value = tv; }
    var city = url.get("city") || "";
    var page = 1, loaded = 0, total = 0, busy = false, seq = 0, ld = [];
    if (sort) { var sl = sort.closest("label"); (sl || sort).style.display = "none"; }
    function card(it) {
      var item = el("div", "w-dyn-item"); item.setAttribute("role", "listitem");
      var art = el("article", "ol-card"); art.dataset.city = it.city || ""; art.dataset.trade = it.trade || it.kind || "";
      var meta = el("div", "ol-card-meta"); meta.appendChild(el("div", "ol-kind", cfg.dir ? (it.kind || "Business").replace(/_/g, " ") : it.kind_label));
      if (it.city) meta.appendChild(el("div", "ol-city", it.city + (it.zip ? " " + it.zip : ""))); art.appendChild(meta);
      var title = el("h3", "ol-card-title", cfg.dir ? it.name : it.title);
      var link = cfg.dir ? it.website : it.source_url; if (link) { var tl = a("cf4-titlelink w-inline-block", link, null, true); tl.appendChild(title); art.appendChild(tl); } else art.appendChild(title);
      if (!cfg.dir && it.summary) art.appendChild(el("p", "ol-card-summary", it.summary));
      var m2 = el("div", "ol-card-meta"), d;
      if (!cfg.dir && (d = fmt(it.deadline))) m2.appendChild(el("div", "ol-city", "Deadline: " + d));
      if ((d = fmt(it.checked))) m2.appendChild(el("div", "ol-city", "Checked: " + d));
      if (m2.childNodes.length) art.appendChild(m2);
      var bottom = el("div", "ol-card-bottom");
      if (cfg.dir) { bottom.appendChild(el("div", "ol-card-trade", it.claim_status === "claimed" ? "Claimed profile" : "Unclaimed profile"));
        if (it.claim_url) bottom.appendChild(a("ol-card-link cft-claim", withRef(it.claim_url), "Claim this business →"));
        else if (it.vendor_onboarding_url) bottom.appendChild(a("ol-card-link", it.vendor_onboarding_url, "Vendor onboarding ↗", true)); }
      else { bottom.appendChild(el("div", "ol-card-trade", it.trade_label));
        if (it.apply_url) bottom.appendChild(a("ol-card-link", it.apply_url, "Apply on official site ↗", true));
        else if (it.source_url) bottom.appendChild(a("ol-card-link", it.source_url, "View official source ↗", true));
        bottom.appendChild(a("ol-card-link cft-claim", withRef(it.alerts_url), "Get matched free →")); }
      art.appendChild(bottom); item.appendChild(art); return item;
    }
    function jsonld() {
      var s = document.getElementById("cft-feed-ld"); if (!s) { s = el("script"); s.type = "application/ld+json"; s.id = "cft-feed-ld"; document.head.appendChild(s); }
      s.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: document.title, numberOfItems: total, itemListElement: ld.slice(0, 50) });
    }
    function show(msg, sub, retry) { status.textContent = ""; status.appendChild(el("strong", null, msg)); if (sub) status.appendChild(el("span", null, sub));
      if (retry) { var b = el("button", "cft-search__clear", "Try again"); b.type = "button"; b.onclick = function () { load(true); }; status.appendChild(b); } status.hidden = false; }
    function load(reset) {
      if (busy && !reset) return; busy = true; var my = ++seq;
      if (reset) { page = 1; loaded = 0; ld = []; }
      var p = new URLSearchParams(); if (!cfg.dir) p.set("tab", cfg.tab); p.set("page", page);
      if (q && q.value.trim()) p.set("q", q.value.trim()); if (trade && trade.value) p.set("trade", trade.value); if (city) p.set("city", city);
      more.disabled = true; more.textContent = "Loading…"; if (count && reset) count.textContent = "Loading " + cfg.noun + "…";
      fetch(API + (cfg.dir ? "directory" : "listings") + "?" + p, { headers: { accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
        if (my !== seq) return;
        if (cms && cms.parentNode) { cms.parentNode.removeChild(cms); cms = null; }
        if (reset) list.textContent = ""; if (oldEmpty) oldEmpty.hidden = true;
        d.items.forEach(function (it) { list.appendChild(card(it)); ld.push({ "@type": "ListItem", position: ld.length + 1, name: cfg.dir ? it.name : it.title, url: (cfg.dir ? it.website : it.source_url) || location.href }); });
        loaded += d.items.length; total = d.total; page++;
        if (count) count.textContent = (loaded < total ? "Showing " + loaded + " of " : "") + total + " " + cfg.noun;
        status.hidden = true; if (!total) show("No " + cfg.noun + " match these filters", "Try a different keyword, city or trade.");
        more.hidden = loaded >= total; more.disabled = false; more.textContent = "Load more"; jsonld();
      }).catch(function () { if (my !== seq) return; more.disabled = false; more.textContent = "Load more";
        if (cms) { if (count) count.textContent = "Showing saved listings"; } else show("We couldn't load " + cfg.noun + " right now", "Please check your connection and try again.", true);
      }).then(function () { if (my === seq) busy = false; });
    }
    wrap.appendChild(list); wrap.appendChild(status); wrap.appendChild(more);
    more.addEventListener("click", function () { load(false); });
    var t; function debounced() { clearTimeout(t); t = setTimeout(function () { load(true); }, 300); }
    // Capture phase on document runs before the legacy CMS filter's target listeners; we handle the event and stop it there.
    document.addEventListener("input", function (e) { if (e.target === q) { e.stopImmediatePropagation(); debounced(); } }, true);
    document.addEventListener("change", function (e) { if (e.target === trade) { e.stopImmediatePropagation(); load(true); } else if (e.target === sort) e.stopImmediatePropagation(); }, true);
    document.addEventListener("submit", function (e) { if (e.target === form) { e.preventDefault(); e.stopImmediatePropagation(); load(true); } }, true);
    document.addEventListener("click", function (e) { if (clear && (e.target === clear || clear.contains(e.target))) { e.preventDefault(); e.stopImmediatePropagation(); if (q) q.value = ""; if (trade) trade.value = ""; city = ""; load(true); } }, true);
    load(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
