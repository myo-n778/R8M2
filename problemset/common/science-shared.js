(function () {
  function normalizeUserName(name) {
    return name ? name.normalize("NFKC").trim() : "";
  }

  function formatDateYmd(timestamp) {
    const ts = Number(timestamp) || 0;
    if (ts <= 0) return "--";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "--";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "/" + m + "/" + day;
  }

  function buildEraSessionStats(userHistory) {
    const stats = {};
    if (!Array.isArray(userHistory) || userHistory.length === 0) return stats;
    userHistory.forEach(function (h) {
      const eraKey = String((h && h.summaryEra) || "").trim();
      if (!eraKey) return;
      if (!stats[eraKey]) stats[eraKey] = { count: 0, lastTs: 0 };
      stats[eraKey].count += 1;
      const ts = Number(h.timestamp) || 0;
      if (ts > stats[eraKey].lastTs) stats[eraKey].lastTs = ts;
    });
    return stats;
  }

  function groupErasBySeason(categories, config) {
    if (!config || !Array.isArray(config.seasonRules) || !config.seasonRules.length) return null;
    const unit = value => {
      const match = String(value || '').normalize('NFKC').trim().replace(/[−－ー―]/g, '-').match(/^(\d+)(?:\s*-\s*(\d+))?/);
      return match ? [Number(match[1]), Number(match[2] || 0)] : null;
    };
    const compare = (a, b) => a[0] - b[0] || a[1] - b[1];
    const groups = new Map();
    categories.forEach(name => {
      const key = unit(name);
      const rule = config.seasonRules.find(rule => {
        const start = unit(rule.start), end = unit(rule.end);
        return key && start && compare(key, start) >= 0 && (!end || compare(key, end) <= 0);
      });
      const id = rule ? String(rule.seasonId || '').trim() : '';
      if (!groups.has(id)) groups.set(id, {id, categories: []});
      groups.get(id).categories.push(name);
    });
    const active = String(config.activeSeasonId || '').trim();
    const order = [...new Set(config.seasonRules.map(rule => String(rule.seasonId || '').trim()))].reverse();
    return [...groups.values()].sort((a, b) => {
      const rank = id => id === active && id ? -1 : !id ? order.length : order.indexOf(id);
      return rank(a.id) - rank(b.id);
    });
  }

  window.ScienceShared = {
    gasUrl: "https://script.google.com/macros/s/AKfycbwcBaf_43QzTh2RJm9SOsOyPMYYw7tpct-bc0tGPVjpPaa_FPWSp7A8ts7qony3znCG7w/exec",
    normalizeUserName: normalizeUserName,
    formatDateYmd: formatDateYmd,
    buildEraSessionStats: buildEraSessionStats,
    groupErasBySeason: groupErasBySeason
  };
})();
