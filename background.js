// background.js
// Handles cross-origin fetches (Amazon review pages, JSON-LD extraction)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FETCH_AMAZON_REVIEWS") {
      fetch(msg.url, {
        headers: {
          "User-Agent": navigator.userAgent,
          "Accept-Language": "en-US,en;q=0.9"
        }
      })
        .then(res => res.text())
        .then(text => sendResponse({ ok: true, text }))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
      return true; // async response
    }
  
    if (msg.type === "EXTRACT_JSONLD_REVIEWS") {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(msg.html, "text/html");
        const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
        let reviews = [];
        for (const s of scripts) {
          try {
            const json = JSON.parse(s.textContent.trim());
            if (json && json.review) {
              const arr = Array.isArray(json.review) ? json.review : [json.review];
              for (const r of arr) {
                if (r.reviewBody) reviews.push(r.reviewBody);
              }
            }
          } catch { /* ignore bad JSON */ }
        }
        sendResponse({ ok: true, reviews });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
  });
  