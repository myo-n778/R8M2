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

  window.ScienceShared = {
    gasUrl: "https://script.google.com/macros/s/AKfycbz-rUP1QhQL2KIrPy2zhjSqhJhwUiz1LiouHAgsf8Rw0hZVTre4FXQEzSO0T7tsMDEe/exec",
    normalizeUserName: normalizeUserName,
    formatDateYmd: formatDateYmd,
    buildEraSessionStats: buildEraSessionStats
  };
})();
