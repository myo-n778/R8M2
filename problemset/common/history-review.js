(function () {
  'use strict';
  function el(doc, tag, text, parent) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  function content(doc, parent, value, images) {
    const text = String(value || '').replace(/<br\s*\/?\s*>/gi, '\n');
    for (const part of text.split(/(\[\[img:[^\]]+\]\])/g)) {
      const match = part.match(/^\[\[img:([^\]]+)\]\]$/);
      if (!match) { parent.appendChild(doc.createTextNode(part)); continue; }
      const entry = images[match[1]];
      if (!entry || !entry.file_path) { el(doc, 'span', '［画像未登録］', parent); continue; }
      const url = new URL(entry.file_path, location.href);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const img = el(doc, 'img', undefined, parent);
      img.src = url.href; img.alt = entry.alt || match[1];
    }
  }
  function createReport(win, entry, items, questions, images, math) {
    const doc = win.document;
    doc.title = '取り組み結果'; doc.documentElement.lang = 'ja'; doc.body.replaceChildren();
    const viewport = el(doc, 'meta', undefined, doc.head);
    viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1';
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if (link.href.includes('katex')) doc.head.appendChild(link.cloneNode(true));
    });
    el(doc, 'style', `
      *{box-sizing:border-box}body{margin:0;color:#202124;background:white;font:16px/1.7 system-ui,sans-serif;letter-spacing:0}
      main,nav{max-width:900px;margin:auto;padding:20px}nav{display:flex;gap:16px;flex-wrap:wrap;border-bottom:1px solid #ccc}
      label{display:flex;gap:8px;align-items:center}button{font:inherit;padding:6px 14px;cursor:pointer}h1{font-size:24px}h2{font-size:18px;overflow-wrap:anywhere}
      article{padding:18px 0;border-bottom:1px solid #ccc;break-inside:avoid}p,li{white-space:pre-wrap;overflow-wrap:anywhere}img{display:block;max-width:100%;max-height:400px;height:auto}
      .note{font-size:14px;color:#555}.hide-result .result,.hide-answer .answer,.hide-explanation .explanation{display:none!important}
      @page{size:A4;margin:15mm}@media print{nav{display:none}main{padding:0;max-width:none}body{font-size:11pt}h1{font-size:16pt}h2{font-size:12pt}}
    `, doc.head);
    const nav = el(doc, 'nav', undefined, doc.body);
    [['result', '正誤'], ['answer', '正解'], ['explanation', '解説']].forEach(([key, title]) => {
      const label = el(doc, 'label', undefined, nav);
      const input = el(doc, 'input', undefined, label);
      input.type = 'checkbox'; input.checked = key === 'result'; label.appendChild(doc.createTextNode(title));
      const update = () => doc.body.classList.toggle('hide-' + key, !input.checked);
      input.addEventListener('change', update); update();
    });
    const print = el(doc, 'button', '印刷・PDF保存', nav);
    print.addEventListener('click', async () => {
      print.disabled = true;
      try {
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images, image => image.decode().catch(() => {})));
        win.focus(); win.print();
      } finally { print.disabled = false; }
    });
    const main = el(doc, 'main', undefined, doc.body);
    el(doc, 'h1', '取り組み結果', main);
    el(doc, 'p', new Date(entry.timestamp).toLocaleString('ja-JP') + '\n' + entry.summaryEra + ' / ' + entry.summaryRange, main);
    el(doc, 'p', '問題文・正解・解説は現在の内容です。問題の並べ替えや削除があると、当時の問題と一致しない場合があります。', main).className = 'note';
    const byId = new Map(questions.map(q => [q.id, q]));
    items.forEach((item, index) => {
      const article = el(doc, 'article', undefined, main);
      el(doc, 'h2', `${index + 1}. ${item.era} / 問題${item.number}`, article);
      const q = byId.get(item.era + '-' + item.number);
      el(doc, 'p', item.result === '○' ? '正解' : item.result === '×' ? '不正解' : '正誤不明', article).className = 'result';
      if (!q) { el(doc, 'p', '現在の問題データに該当する問題がありません。', article); return; }
      content(doc, el(doc, 'p', undefined, article), q.question, images);
      const options = el(doc, 'ol', undefined, article);
      (q.options || []).forEach(option => content(doc, el(doc, 'li', undefined, options), option, images));
      const answer = el(doc, 'p', undefined, article); answer.className = 'answer';
      content(doc, answer, '正解：' + q.answer, images);
      const explanation = el(doc, 'p', undefined, article); explanation.className = 'explanation';
      content(doc, explanation, q.explanation, images);
    });
    math(main);
  }
  function mount(root, getState) {
    if (!root) return;
    let count = 20;
    const render = () => {
      root.replaceChildren();
      const state = getState();
      const history = [...state.history].sort((a, b) => b.timestamp - a.timestamp);
      if (!history.length) { el(document, 'p', '取り組み履歴はありません。', root); return; }
      history.slice(0, count).forEach(entry => {
        const button = el(document, 'button', new Date(entry.timestamp).toLocaleString('ja-JP') + '　' + entry.summaryEra + ' / ' + entry.summaryRange, root);
        button.type = 'button';
        button.style.cssText = 'display:block;width:100%;text-align:left;padding:12px 0;border-bottom:1px solid #8885;overflow-wrap:anywhere';
        button.addEventListener('click', async () => {
          const win = window.open('', '_blank');
          if (!win) { window.alert('結果を開くため、ポップアップを許可してください。'); return; }
          win.document.title = '取り組み結果'; el(win.document, 'p', '履歴を読み込んでいます…', win.document.body);
          try {
            const result = await state.load(entry);
            if (win.closed) return;
            if (result.status !== 'success' || !Array.isArray(result.items)) throw new Error(result.message || '履歴閲覧にはGASの更新が必要です。');
            if (getState().userId !== state.userId) throw new Error('利用者が切り替わりました。履歴を開き直してください。');
            createReport(win, entry, result.items, state.questions, state.images, state.math);
          } catch (error) {
            if (!win.closed) { win.document.body.replaceChildren(); el(win.document, 'p', error.message || '履歴を取得できませんでした。元の画面から開き直してください。', win.document.body); }
          }
        });
      });
      if (history.length > count) {
        const more = el(document, 'button', 'さらに表示', root);
        more.type = 'button'; more.addEventListener('click', () => { count += 20; render(); });
      }
    };
    root.parentElement.addEventListener('toggle', () => { if (root.parentElement.open) render(); });
    return { refresh: () => { if (root.parentElement.open) render(); } };
  }
  window.HistoryReview = { mount, createReport };
})();
