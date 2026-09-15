/* Shared science AI endpoint. Never put API credentials in this file. */
(() => {
    'use strict';
    const ENDPOINT = 'https://script.google.com/macros/s/AKfycbx8mgOG9OxTVGs9L9wRh_PF72lqRGsdFJzyqtpSzKtYETQqQ-ifGaNBgdB5RzmEiW6C/exec';
    const APP_ID = 'm2'; // Registered server-side profile; H2 integration uses 'h2'.
    let session = null;
    let dispose = () => {};
    let uncertain = false;
    const usage = new Map();
    const messages = {
        not_configured: 'AI解説は準備中です。通常の解説をご利用ください。',
        material_mismatch: '教材が更新されています。ホームで同期してから解き直してください。',
        material_source_error: 'この教材はAI解説の対象外、または取得できません。先生に確認してください。',
        app_mismatch: 'AI解説の接続設定が一致しません。先生に確認してください。',
        usage_limit: 'AI解説の利用上限に達しました。', daily_limit: '本日のAI解説は上限に達しました。',
        session_limit: '現在、新しいAI解説を開始できません。', session_expired: 'AI解説の有効時間が切れました。',
        request_busy: '別のAI解説を処理中です。', request_pending: '前の質問を処理中です。',
        connection_failed: '通信に失敗しました。自動再送はしません。利用回数が消費されている場合があります。',
        insufficient_quota: 'AIサービスの利用枠が不足しています。', rate_limit_exceeded: 'AIサービスが混雑しています。'
    };
    const el = (tag, text, parent) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (parent) parent.append(node);
        return node;
    };
    async function signature(q) {
        const bytes = new TextEncoder().encode(JSON.stringify([APP_ID,q.id,q.era,q.question,q.options,q.answer,q.explanation]));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
    }
    function mount(host, q, selected) {
        dispose();
        if (!host) return;
        host.replaceChildren();
        let alive = true;
        let controller = null;
        let busy = false;
        let answerInFlight = false;
        dispose = () => { alive = false; if (answerInFlight) uncertain = true; controller?.abort(); host.replaceChildren(); };
        const root = el('details', undefined, host);
        root.className = 'm2-ai';
        el('summary', 'AI解説を見る', root);
        const body = el('div', undefined, root);
        body.className = 'm2-ai-body';
        el('p', 'AIの回答には誤りが含まれることがあります。疑問が残る場合は先生に確認してください。氏名などの個人情報は入力しないでください。', body).className = 'm2-ai-notice';
        const controls = el('div', undefined, body);
        controls.className = 'm2-ai-controls';
        const difference = el('button', selected === q.answer ? '正解の理由' : '選んだ答えとの違い', controls);
        const simple = el('button', 'やさしく説明', controls);
        const history = el('div', undefined, body);
        history.className = 'm2-ai-history';
        const form = el('form', undefined, body);
        const label = el('label', 'この問題について質問', form);
        const input = el('textarea', undefined, label);
        input.rows = 2; input.maxLength = 300;
        const send = el('button', undefined, form);
        send.type = 'submit'; send.title = '質問を送信'; send.setAttribute('aria-label','質問を送信');
        const icon = el('i', undefined, send); icon.className = 'fas fa-paper-plane'; icon.setAttribute('aria-hidden','true');
        const status = el('p', undefined, body);
        status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
        const count = el('p', undefined, body); count.className = 'm2-ai-notice';
        for (const button of [difference,simple]) button.type = 'button';
        function refresh() {
            const used = usage.get(q.id) || 0;
            const limited = used >= 3 || (session?.used || 0) >= 20;
            for (const button of [difference,simple,send]) button.disabled = busy || uncertain || limited || !ENDPOINT;
            input.disabled = busy || uncertain || limited || !ENDPOINT;
            send.disabled = send.disabled || !input.value.trim();
            count.textContent = `この問題 ${used}/3回 ・ この利用セッション ${session?.used || 0}/20回`;
        }
        async function post(payload) {
            controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch(ENDPOINT, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit',redirect:'follow'});
                if (!response.ok) throw new Error('connection_failed');
                return await response.json();
            } finally { clearTimeout(timer); }
        }
        async function ask(action, text = '') {
            if (busy || uncertain || !ENDPOINT) return;
            busy = true; status.textContent = '考えています…'; refresh();
            let answerStarted = false;
            try {
                if (!session) {
                    const result = await post({operation:'session',appId:APP_ID});
                    if (!alive) return;
                    if (result.error) throw new Error(result.error);
                    if (result.bankVersion !== 'science-sheets-v2' || result.appId !== APP_ID || typeof result.token !== 'string') throw new Error('material_mismatch');
                    session = {...result,used:0};
                }
                const sign = await signature(q);
                if (!alive) return;
                answerStarted = true;
                answerInFlight = true;
                const result = await post({operation:'answer',appId:APP_ID,token:session.token,requestId:crypto.randomUUID(),id:q.id,category:q.era,mode:APP_ID,signature:sign,selected,action,text});
                answerInFlight = false;
                if (!alive) return;
                if (!result.error && (result.appId !== APP_ID || result.bankVersion !== 'science-sheets-v2')) throw new Error('app_mismatch');
                if (result.budget) {
                    usage.set(q.id, Math.max(usage.get(q.id) || 0, result.budget.questionUsed || 0));
                    session.used = Math.max(session.used, result.budget.sessionUsed || 0);
                }
                if (!alive) return;
                if (result.error) throw new Error(result.error);
                if (!result.reply || !['conclusion','distinction','checkQuestion'].every(k => typeof result.reply[k] === 'string')) throw new Error('invalid_response');
                const entry = el('section', undefined, history);
                el('h4', action === 'question' ? text : action === 'simple' ? 'やさしく説明' : difference.textContent, entry);
                for (const key of ['conclusion','distinction','checkQuestion']) if (result.reply[key]) el('p',result.reply[key],entry);
                status.textContent = result.reply.status === 'insufficient_context' ? '教材の確認が必要です。' : result.reply.status === 'out_of_scope' ? 'この問題に関する質問を入力してください。' : '';
                if (action === 'question') input.value = '';
            } catch (error) {
                const code = error.name === 'AbortError' || error instanceof TypeError ? 'connection_failed' : error.message;
                if (alive && answerStarted && ['connection_failed','invalid_response'].includes(code)) uncertain = true;
                if (alive) status.textContent = messages[code] || 'AI解説を取得できませんでした。自動再送はしません。';
            } finally { busy = false; answerInFlight = false; if (alive) refresh(); }
        }
        difference.onclick = () => ask('difference');
        simple.onclick = () => ask('simple');
        form.onsubmit = event => { event.preventDefault(); if (input.value.trim() && !send.disabled) ask('question',input.value.trim()); };
        input.oninput = refresh;
        status.textContent = !ENDPOINT ? messages.not_configured : uncertain ? messages.connection_failed : '';
        refresh();
    }
    window.M2AiTutor = {mount,reset() {dispose();},logout() {dispose(); session = null; usage.clear(); uncertain = false;}};
})();
