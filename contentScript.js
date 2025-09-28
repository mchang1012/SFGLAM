// contentScript.js
// Floating panel: computes sensory score and updates as you scroll or as new reviews load.

// ---- Guard against multiple injections ----
if (window.__MAKEUP_SENSORY_ACTIVE__) {
    console.log("Makeup Sensory Score already active, skipping reinjection");
  } else {
    window.__MAKEUP_SENSORY_ACTIVE__ = true;
  
    // Global state
    window.__BSC_REVIEWS_SEEN__ = new Set();
    window.__BSC_CURRENT_PRODUCT__ = null;
  
    (() => {
      // ---- Sensory keyword weights ----
      const GOOD = {
        "fragrance-free": 3, "unscented": 3, "no scent": 2, "odorless": 2,
        "lightweight": 2, "light weight": 2, "non-sticky": 2, "not sticky": 2,
        "non greasy": 2, "non-greasy": 2, "non oily": 2, "non-oily": 2,
        "not greasy": 2, "not oily": 2,
        "non irritating": 3, "non-irritating": 3,
        "gentle": 2, "soothing": 2, "calming": 2,
        "soft": 1, "smooth": 1, "hydrating": 1, "moisturizing": 1,
        "breathable": 2, "comfortable": 2,
        "blendable": 1, "buildable": 1,
        "no white cast": 3, "no residue": 2,
        "quick-drying": 1, "dries quickly": 1,
        "weightless": 2, "flexible": 1, "silky": 1
      };
  
      const BAD = {
        "fragrance": 3, "scented": 3, "perfume": 3, "perfumey": 3,
        "strong scent": 3, "overpowering": 3, "chemical smell": 3, "alcohol smell": 2,
        "sticky": 3, "tacky": 3, "greasy": 3, "oily": 3, "heavy": 3, "thick": 2,
        "clumpy": 2, "cakey": 2, "chalky": 2, "dusty": 2, "flaky": 2,
        "patchy": 2, "pilling": 2, "tight": 2,
        "irritating": 4, "irritation": 4, "itchy": 3,
        "burning": 4, "stinging": 4, "tingling": 3,
        "redness": 2, "breakouts": 2, "breakout": 2
      };
  
      const NEGATIONS = ["not", "no", "never", "without", "isn't", "wasn't", "aren't", "don't", "doesn't", "didn't"];
  
      // ---- Helpers ----
      function normalizeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }
      function sentenceSplit(text) { return normalizeText(text).split(/(?<=[\.!\?])\s+/); }
      function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  
      function extractMentions(text) {
        const lower = text.toLowerCase();
        const hits = [];
        const allPhrases = [
          ...Object.keys(GOOD).map(k => ({ k, w: GOOD[k], good: true })),
          ...Object.keys(BAD).map(k => ({ k, w: BAD[k], good: false }))
        ].sort((a, b) => b.k.length - a.k.length);
  
        for (const { k, w, good } of allPhrases) {
          const pattern = new RegExp(`\\b${escapeRegex(k)}\\b`, "g");
          let m;
          while ((m = pattern.exec(lower)) !== null) {
            const idxChar = m.index;
            const prefix = lower.slice(Math.max(0, idxChar - 60), idxChar);
            const nearby = prefix.split(/\s+/).slice(-3);
            const negated = nearby.some(t => NEGATIONS.includes(t));
            hits.push({ phrase: k, good, weight: w, negated });
          }
        }
        return hits;
      }
  
      // ---- Adjusted Scoring ----
      function scoreFromMentions(mentions, totalReviewCount) {
        let pos = 0, neg = 0;
        const posCountMap = new Map();
        const negCountMap = new Map();
  
        for (const m of mentions) {
          const effectiveGood = m.negated ? !m.good : m.good;
          if (effectiveGood) {
            pos += m.weight;
            posCountMap.set(m.phrase, (posCountMap.get(m.phrase) || 0) + 1);
          } else {
            neg += m.weight;
            negCountMap.set(m.phrase, (negCountMap.get(m.phrase) || 0) + 1);
          }
        }
  
        // --- Adjusted scoring ---
        const smooth = 2; // less harsh smoothing (was 6)
        const raw = (pos / (pos + neg + smooth)) * 100;
  
        // Confidence rises with more reviews
        const conf = Math.max(0, Math.min(1, Math.log10((totalReviewCount || 0) + 1) / 2));
  
        // Blend toward 65 instead of 50 → "average" products don’t look bad
        const blended = (raw * conf) + (65 * (1 - conf));
  
        return {
          score: Math.round(blended),
          rawScore: Math.round(raw),
          posCountMap,
          negCountMap,
          confidence: Math.round(conf * 100)
        };
      }
  
      function topEntries(map, k = 5) {
        return [...map.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, k)
          .map(([phrase, count]) => ({ phrase, count }));
      }
  
      function scrapeVisibleReviews() {
        const selectors = [
          '[data-comp="Review"] p', '[data-comp="Text"]', '.css-1h020vy',
          '.ReviewText__content', '[data-at="reviewText"]', '[class*="ReviewText"]',
          '[data-hook="review-body"]', '[data-hook="review"] span',
          '.review, .review-item, .ugc-review, .c-review',
          '[itemprop="reviewBody"]',
          '.review__text, .Review__Text, .pr-rd-description-text'
        ];
        const texts = [];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => {
            const t = (el.innerText || el.textContent || '').trim();
            if (t && t.split(' ').length > 5) texts.push(t);
          });
        }
        return [...new Set(texts)];
      }
  
      // ---- Product info ----
      function inferProductType() {
        const title = document.querySelector('h1, h1 span, [data-at="product_title"]')?.innerText?.toLowerCase() || "";
        const crumbs = [...document.querySelectorAll('nav a, .breadcrumb a, [data-at="breadcrumb"] a')]
          .map(a => a.textContent.toLowerCase()).join(" ");
        const text = `${title} ${crumbs}`;
        if (/liquid blush/.test(text)) return "liquid blush";
        if (/cream blush/.test(text)) return "cream blush";
        if (/powder blush/.test(text)) return "powder blush";
        if (/foundation/.test(text)) return "foundation";
        if (/concealer/.test(text)) return "concealer";
        if (/mascara/.test(text)) return "mascara";
        if (/lip/.test(text)) return "lip product";
        return "beauty product";
      }
      function currentProductName() {
        const el = document.querySelector('h1, h1 span, [data-at="product_title"], [data-test="product-title"]');
        return el ? el.textContent.trim() : (document.title || "This product");
      }
  
      // ---- UI ----
      let panel, shadow;
      function ensurePanel() {
        if (document.querySelector("#bsc-root")) return;
        panel = document.createElement('div');
        panel.id = "bsc-root";
        shadow = panel.attachShadow({ mode: 'open' });
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <style>
            .bsc {position:fixed;top:80px;right:16px;z-index:999999;width:320px;max-height:80vh;overflow:auto;
              background:#111827f7;color:#f9fafb;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.25);backdrop-filter:blur(6px);}
            .hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #1f2937;position:sticky;top:0;background:#111827f7;}
            .title{font-weight:700;font-size:14px;}
            .btn{cursor:pointer;border:1px solid #374151;background:#0b1220;color:#e5e7eb;padding:2px 6px;border-radius:6px;font-size:12px;}
            .sec{padding:12px;border-bottom:1px dashed #1f2937;}
            .score{font-size:42px;font-weight:800;}
            .kv{display:flex;gap:8px;font-size:12px;opacity:.9;margin-top:8px;flex-wrap:wrap;}
            .pill{display:inline-flex;gap:6px;align-items:center;font-size:12px;background:#0B1220;padding:4px 8px;border-radius:9999px;}
            .pill.good{border:1px solid #22c55e33;}
            .pill.bad{border:1px solid #ef444433;}
            .quote{font-size:12px;opacity:.9;border-left:3px solid #374151;padding-left:8px;margin-top:6px;}
            .ok{color:#22c55e}.mid{color:#f59e0b}.low{color:#ef4444}
            .meter{height:8px;background:#1f2937;border-radius:8px;overflow:hidden;margin-top:10px;}
            .meter>div{height:100%;width:0%;background:linear-gradient(90deg,#ef4444,#f59e0b,#22c55e);transition:width .5s;}
          </style>
          <div class="bsc">
            <div class="hdr">
              <div class="title">Makeup Sensory Score</div>
              <button id="bsc-collapse" class="btn">–</button>
            </div>
            <div id="bsc-body"></div>
          </div>`;
        shadow.appendChild(wrap);
        document.documentElement.appendChild(panel);
        shadow.getElementById('bsc-collapse').addEventListener('click', () => {
          const body = shadow.getElementById('bsc-body');
          body.style.display = body.style.display === 'none' ? '' : 'none';
        });
      }
  
      function colorClass(score) {
        if (score >= 75) return 'ok';
        if (score >= 55) return 'mid';
        return 'low';
      }
  
      function renderScoreCard(model) {
        ensurePanel();
        const body = shadow.getElementById('bsc-body');
        if (!body) return;
        const { productName, productType, score, rawScore, confidence, totalReviews, posTop, negTop, sampleQuotes } = model;
        const meterWidth = Math.max(0, Math.min(100, score));
        const scoreClass = colorClass(score);
  
        body.innerHTML = `
          <div class="sec">
            <div>
              <div class="muted tiny">Analyzed:</div>
              <div style="font-weight:600">${escapeHtml(productName)}</div>
              <div class="tiny muted">${escapeHtml(productType)}</div>
            </div>
            <div class="score ${scoreClass}" title="Confidence ${confidence}%">${score}</div>
            <div class="meter"><div style="width:${meterWidth}%"></div></div>
            <div class="kv">
              <span>Raw: ${rawScore}</span>
              <span>Confidence: ${confidence}%</span>
              <span>Reviews scanned: ${totalReviews}</span>
            </div>
          </div>
          <div class="sec">
            <div style="font-weight:600;margin-bottom:6px">Why this rating</div>
            <div>
              <div class="muted tiny">Top positive sensory cues</div>
              <div>${posTop.map(e => `<span class="pill good">+ ${escapeHtml(e.phrase)} ×${e.count}</span>`).join(' ') || '<span class="tiny muted">None found</span>'}</div>
              <div class="muted tiny" style="margin-top:8px">Top negative sensory cues</div>
              <div>${negTop.map(e => `<span class="pill bad">– ${escapeHtml(e.phrase)} ×${e.count}</span>`).join(' ') || '<span class="tiny muted">None found</span>'}</div>
              ${sampleQuotes.length ? `<div class="muted tiny" style="margin-top:10px">Example snippets</div>` : ''}
              ${sampleQuotes.map(q => `<div class="quote">“${escapeHtml(q)}”</div>`).join('')}
            </div>
          </div>`;
        const bar = body.querySelector('.meter > div');
        if (bar) requestAnimationFrame(() => bar.style.width = `${meterWidth}%`);
      }
  
      function escapeHtml(s) {
        return (s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      }
  
      function sampleSnippets(reviews, want = 3, keyPhrases = []) {
        const out = [];
        const phrases = keyPhrases.map(k => new RegExp(`\\b${escapeRegex(k)}\\b`, 'i'));
        for (const r of reviews) {
          const sents = sentenceSplit(r).slice(0, 4);
          for (const s of sents) {
            if (!s || s.length < 30) continue;
            if (phrases.length === 0 || phrases.some(rx => rx.test(s))) {
              out.push(s.trim());
              if (out.length >= want) return out;
            }
          }
        }
        return out.slice(0, want);
      }
  
      // ---- Main ----
      async function analyzePage() {
        ensurePanel();
        const productName = currentProductName();
        const productType = inferProductType();
  
        // Reset if product changes
        if (window.__BSC_CURRENT_PRODUCT__ !== productName) {
          window.__BSC_CURRENT_PRODUCT__ = productName;
          window.__BSC_REVIEWS_SEEN__ = new Set();
        }
  
        function rescanAndUpdate() {
          const newReviews = scrapeVisibleReviews();
          for (const r of newReviews) {
            window.__BSC_REVIEWS_SEEN__.add(r);
          }
  
          const reviews = [...window.__BSC_REVIEWS_SEEN__];
          const totalReviews = reviews.length;
  
          const mentions = [];
          for (const r of reviews) mentions.push(...extractMentions(r));
          const s = scoreFromMentions(mentions, totalReviews);
          const posTop = topEntries(s.posCountMap, 6);
          const negTop = topEntries(s.negCountMap, 6);
          const quotes = sampleSnippets(
            reviews,
            3,
            [...posTop.map(x => x.phrase), ...negTop.map(x => x.phrase)]
          );
  
          renderScoreCard({
            productName,
            productType,
            score: s.score,
            rawScore: s.rawScore,
            confidence: s.confidence,
            totalReviews,
            posTop,
            negTop,
            sampleQuotes: quotes
          });
        }
  
        // Initial run
        rescanAndUpdate();
  
        // Watch for new reviews
        const reviewContainer = document.querySelector("#cm_cr-review_list") || document.body;
        const observer = new MutationObserver(() => rescanAndUpdate());
        observer.observe(reviewContainer, { childList: true, subtree: true });
  
        // Also refresh on scroll
        window.addEventListener("scroll", () => {
          clearTimeout(window.__bsc_scroll_timer);
          window.__bsc_scroll_timer = setTimeout(rescanAndUpdate, 800);
        });
      }
  
      ensurePanel();
      analyzePage();
    })();
  }
  