// Legacy Path — first-touch campaign attribution for the static landing page.
// Stores UTM tags, the referring host and the landing path in this browser
// only. The app writes them to lp_attribution once, after the visitor creates
// an account. Nothing here identifies a person. Keep the key and shape in step
// with captureAttribution() in src/legacy/api.js.
(function () {
  var KEY = 'lp_attr_v1'
  var MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
  var clip = function (v, n) { return v ? String(v).slice(0, n) : null }
  try {
    var q = new URLSearchParams(window.location.search)
    var ref = document.referrer ? new URL(document.referrer).hostname : null
    var external = ref && ref !== window.location.hostname
    var tagged = !!q.get('utm_source') || !!external
    var prev = JSON.parse(window.localStorage.getItem(KEY) || 'null')
    var fresh = prev && Date.now() - (prev.t || 0) < MAX_AGE_MS
    // First touch wins, except that a campaign click replaces a plain visit.
    if (fresh && (prev.utm_source || prev.referrer_host || !tagged)) return
    window.localStorage.setItem(KEY, JSON.stringify({
      utm_source: clip(q.get('utm_source'), 80),
      utm_medium: clip(q.get('utm_medium'), 80),
      utm_campaign: clip(q.get('utm_campaign'), 80),
      utm_content: clip(q.get('utm_content'), 80),
      utm_term: clip(q.get('utm_term'), 80),
      referrer_host: external ? clip(ref, 253) : null,
      landing_path: clip(window.location.pathname, 200),
      t: Date.now(),
    }))
  } catch (e) { /* storage blocked: attribution is best-effort */ }
})()
