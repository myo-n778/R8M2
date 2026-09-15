const SCIENCE_AI_PROTOCOL = 'science-sheets-v2';
const SCIENCE_AI_APPS = {
 m2: {spreadsheetId:'1LCGCVjeiTicyclXFTP0EaxxB_RluZJrveWPo1FdLzsk',instruction:'中学2年理科の学習支援者です。中学理科の範囲と用語で説明してください。'},
 h2: {spreadsheetId:'15hI6L62uw7iR10mhGc0c24g2SWx5lx0srAInRQZmswo',instruction:'高校2年物理の学習支援者です。高校物理の範囲で、式の意味・成立条件・単位・符号を明確にして説明してください。'}
};
function scienceAiProfile_(appId) {
 if (typeof appId !== 'string' || !Object.prototype.hasOwnProperty.call(SCIENCE_AI_APPS, appId)) scienceAiError_('invalid_app');
 let allowed;
 try { allowed = JSON.parse(PropertiesService.getScriptProperties().getProperty('SCIENCE_AI_' + appId.toUpperCase() + '_SHEETS') || '[]'); }
 catch (_) { scienceAiError_('not_configured'); }
 if (!Array.isArray(allowed) || !allowed.length || allowed.some(x => typeof x !== 'string' || !x.trim())) scienceAiError_('not_configured');
 return {...SCIENCE_AI_APPS[appId],appId:appId,sheets:allowed};
}
function scienceAiQuestion_(category, mode, id) {
 const profile = scienceAiProfile_(mode);
 if (!profile.sheets.includes(category)) scienceAiError_('material_mismatch');
 let rows;
 try {
  const sheet = SpreadsheetApp.openById(profile.spreadsheetId).getSheetByName(category);
  if (!sheet || sheet.getLastRow() * sheet.getLastColumn() > 100000 || sheet.getLastColumn() !== 15) scienceAiError_('material_source_error');
  rows = sheet.getDataRange().getValues().filter(row => row.some(c => {
   const s = String(c || '').trim(); return s !== '' && s !== 'undefined' && s !== 'null';
  })).map(row => row.map(c => String(c || '').trim().replace(/[\t\n\r]/g, ' ').trim().replace(/^"|"$/g, '')));
 } catch (_) { scienceAiError_('material_source_error'); }
 const headers = ['問題','問','元素記号','元素名','原子番号','記号','名称','番号'];
 let number = 0;
 for (let i = 0; i < rows.length; i++) {
  const cols = rows[i];
  if (i === 0 && cols.some(c => headers.includes(c))) continue;
  number++;
  if (id !== category + '-' + number) continue;
  const q = {id:id,category:category,mode:mode,
   prompt:cols[0].replace(/^[（\(](基礎|標準|応用|発展)[）\)]/, '').trim().replace(/([①②③④])/g, '<br>$1').replace(/^<br>/, ''),
   choices:cols.slice(1,5),correct:parseInt(cols[10]) >= 1 && parseInt(cols[10]) <= 4 ? cols[parseInt(cols[10])] : cols[10],
   explanation:(cols[13] || cols[14] || '詳細解説準備中。').replace(/([①②③④])/g, '<br>$1')};
  if (!q.prompt || !q.correct || !q.choices.includes(q.correct)) scienceAiError_('material_mismatch');
  q.signature = scienceAiHash_(JSON.stringify([profile.appId,q.id,q.category,q.prompt,q.choices,q.correct,q.explanation]));
  return q;
 }
 scienceAiError_('material_mismatch');
}
