const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const path = join(__dirname, '..');
const code = readFileSync(join(path, 'GAS.txt'), 'utf8');
const html = readFileSync(join(path, 'science2.0.html'), 'utf8');
const sheetId = '1LCGCVjeiTicyclXFTP0EaxxB_RluZJrveWPo1FdLzsk';
const config = { activeSeasonId: 'R8-3', seasonRules: [{ start: '3-1', end: '3-8', seasonId: 'R8-3' }] };

function gasFixture() {
    const read = [];
    const makeSheet = (name, values) => ({
        getName: () => name,
        getDataRange: () => {
            read.push(name);
            return { getValues: () => values, getDisplayValues: () => values };
        }
    });
    const book = [
        makeSheet('設定', [['key', 'value'], ['activeSeasonId', 'R8-3'],
            ['seasonRules', '3-1..3-8=R8-3'], ['hiddenProblemSheets', '3-8非表示']]),
        makeSheet('3-7確認', [['q1', 'a'], ['q2', 'b']]),
        makeSheet('3-8非表示', [['private1', 'a'], ['private2', 'b']]),
        makeSheet('AI質問', [['user', 'question'], ['u', 'q']])
    ];
    const opened = [];
    const context = vm.createContext({
        console: { log() {}, info() {}, error() {} },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
        SpreadsheetApp: { openById: id => {
            opened.push(id);
            return {
                getSheets: () => book,
                getSheetByName: name => {
                    if (/履歴|統計/.test(name)) read.push(name);
                    return book.find(sheet => sheet.getName() === name) || null;
                }
            };
        }}
    });
    vm.runInContext(code, context);
    return { opened, read, request: (action, id = sheetId) => context.doGet({ parameter: { action, id } }) };
}

test('materials response preserves visible legacy content and never reads history or writes settings', () => {
    const f = gasFixture();
    const materials = f.request('syncMaterials');
    assert.equal(materials.syncStage, 'materials');
    assert.deepEqual(Object.keys(materials).sort(), ['config', 'imageMap', 'problems', 'sheetOrder', 'syncStage']);
    assert.deepEqual(materials.config.seasonRules, config.seasonRules);
    assert.deepEqual(materials.problems, { '3-7確認': 'q1\ta\nq2\tb' });
    assert(f.read.every(name => ['設定', '3-7確認'].includes(name)));
    const full = f.request('sync');
    assert.deepEqual(full.problems, materials.problems);
    assert.deepEqual(full.sheetOrder, materials.sheetOrder);
    assert.deepEqual(full.config, materials.config);
});

test('stats avoids material reads and refuses every other spreadsheet', () => {
    const f = gasFixture();
    assert.match(f.request('syncMaterials', 'other').error, /Unsupported spreadsheet/);
    assert.match(f.request('syncStats', 'other').error, /Unsupported spreadsheet/);
    assert.deepEqual(f.opened, []);
    const stats = f.request('syncStats');
    assert.equal(stats.syncStage, 'stats');
    assert.equal(Object.hasOwn(stats, 'problems'), false);
    assert.equal(Object.hasOwn(stats, 'imageMap'), false);
    assert(!f.read.includes('3-7確認'));
    assert(f.read.includes('履歴ログ'));
    const full = f.request('sync');
    for (const key of ['history', 'seasonHistory', 'ranking', 'userStats', 'lifetimeSummary']) {
        assert.deepEqual(stats[key], full[key]);
    }
});

function clientFixture(entries = new Map()) {
    const from = html.indexOf("        const MATERIAL_SNAPSHOT_KEY");
    const to = html.indexOf('        function shuffleArray(', from);
    const source = html.slice(from, to);
    const requests = [], displays = [], statuses = [];
    const context = vm.createContext({
        console, setTimeout, clearTimeout, URLSearchParams, AbortController,
        FIXED_GAS_URL: 'https://example.test/exec',
        FIXED_SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit',
        activeSync: null, materialLibraryReady: false, USER_NAME: '', USER_CLASS: '', USER_NUMBER: '',
        localStorage: { getItem: key => entries.get(key) ?? null, setItem: (key, v) => entries.set(key, v), removeItem: key => entries.delete(key) },
        getEl: id => id === 'library-sync-status' ? {
            set textContent(value) { statuses.push(value); }, classList: { toggle() {} }
        } : null,
        questionStats: {}, sanitizeProblemSheets: x => x, sanitizeSheetOrder: x => x, normalizeImageMap: x => x,
        updateStatsUI() {}, buildFallbackLifetimeRanking: () => [],
        updateRuntimeConfigUI(data) { context.runtimeConfigState = data; },
        showDiagnosticError(e) { throw e; },
        window: { renderEraMenu() { displays.push(entries.get('r8m2_data_main')); } },
        fetch: url => new Promise((resolve, reject) => {
            const params = new URL(url).searchParams;
            requests.push({ action: params.get('action'), userId: params.get('userId'), reject,
                deliver: body => resolve({ ok: true, json: async () => body }) });
        })
    });
    vm.runInContext(source, context);
    return { entries, requests, displays, statuses, context, start: () => context.window.syncAllFromSpreadsheet(true) };
}
const materials = { syncStage: 'materials', problems: { '3-7確認': 'sample' }, sheetOrder: ['3-7確認'], imageMap: [], config };
const stats = { syncStage: 'stats', history: [], ranking: [{ exp: 4 }], userStats: { '3-7確認-1': { total: 9 } } };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('cold visit shows materials before deferred history; history does not overwrite an answer', async () => {
    const app = clientFixture();
    const done = app.start();
    assert.equal(app.displays.length, 0);
    assert.equal(app.requests[0].action, 'syncMaterials');
    assert.equal(app.requests[0].userId, null);
    app.requests[0].deliver(materials);
    await tick();
    assert.equal(app.displays.length, 1);
    assert.equal(app.requests[1].action, 'syncStats');
    app.context.questionStats['3-7確認-1'] = { total: 1 };
    app.requests[1].deliver(stats);
    await done;
    assert.equal(app.context.questionStats['3-7確認-1'].total, 1);
    assert.equal(app.context.rankingData[0].exp, 4);
    assert.equal(app.statuses.at(-1), '');
});

test('warm visit shows cached materials immediately; failed stats leaves them available', async () => {
    const cache = new Map([
        ['r8m2_material_snapshot_v1', JSON.stringify({ sid: sheetId, savedAt: Date.now(), config })],
        ['r8m2_data_main', JSON.stringify(materials.problems)]
    ]);
    const app = clientFixture(cache);
    const done = app.start();
    assert.equal(app.displays.length, 1);
    app.requests[0].deliver(materials);
    await tick();
    app.requests[1].reject(Error('network unavailable'));
    await done;
    assert.equal(app.displays.length, 2);
    assert.match(app.statuses.at(-1), /更新できませんでした/);
});

test('switching identity rejects an older user response and keeps the new history', async () => {
    const app = clientFixture();
    app.context.USER_NAME = 'Test A';
    app.context.USER_CLASS = 'T';
    app.context.USER_NUMBER = '1';
    const first = app.start();
    app.requests[0].deliver(materials);
    await tick();
    assert.equal(app.requests[1].userId, 'T-1-Test A');
    app.context.USER_NAME = 'Test B';
    const second = app.start();
    app.requests[2].deliver(materials);
    await tick();
    assert.equal(app.requests[3].userId, 'T-1-Test B');
    app.requests[3].deliver(stats);
    await second;
    app.requests[1].deliver({ ...stats, ranking: [{ exp: 99 }] });
    await first;
    assert.equal(app.context.rankingData[0].exp, 4);
});
