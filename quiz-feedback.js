(() => {
// Transient feedback is triggered only by a newly accepted, binary-correct answer.
let soundEnabled = false;
let audioContext;
let audioGeneration = 0;
let voices = [];
let hideTimer;
let circle;
let status;
let soundButton;
function stopSound() {
  audioGeneration += 1;
  voices.forEach(({ oscillator, gain }) => {
    try { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } catch (_) { /* already stopped */ }
  });
  voices = [];
}
function clear() {
  window.dispatchEvent(new Event('quiz-feedback-clear'));
  clearTimeout(hideTimer);
  if (circle) circle.hidden = true;
  if (status) status.textContent = '';
  stopSound();
}
function setSoundEnabled(enabled) {
  soundEnabled = enabled === true;
  if (!soundEnabled) stopSound();
  if (soundButton) {
    soundButton.textContent = soundEnabled ? '音 ON' : '音 OFF';
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
  }
}
function ensureElements() {
  if (circle && circle.isConnected) return;
  const style = document.createElement('style');
  style.textContent = `
    .quiz-correct-circle { position:fixed; inset:0; margin:auto; width:min(52vw,52vh,260px); height:min(52vw,52vh,260px); box-sizing:border-box; border:clamp(12px,3vw,22px) solid #dc2626; border-radius:50%; box-shadow:0 0 0 4px #fff; z-index:2147483000; pointer-events:none; animation:quiz-circle-in 160ms ease-out; }
    .quiz-correct-circle[hidden] { display:none !important; }
    .quiz-feedback-status { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
    .quiz-sound-control { display:flex; justify-content:flex-end; padding:8px; }
    .quiz-sound-control button { font:inherit; font-size:14px; min-height:44px; padding:8px 14px; border:1px solid currentColor; border-radius:8px; color:inherit; background:transparent; cursor:pointer; }
    .quiz-sound-control button:focus-visible { outline:3px solid #2563eb; outline-offset:3px; }
    @keyframes quiz-circle-in { from { opacity:0; transform:scale(.88); } to { opacity:1; transform:scale(1); } }
    @media (prefers-reduced-motion:reduce) { .quiz-correct-circle { animation:none; } }
  `;
  document.head.appendChild(style);
  circle = document.createElement('div');
  circle.className = 'quiz-correct-circle';
  circle.hidden = true;
  circle.setAttribute('aria-hidden', 'true');
  status = document.createElement('div');
  status.className = 'quiz-feedback-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  document.body.append(circle, status);
}
function playTone(authorized = soundEnabled, variant = 1) {
  if (!authorized) return;
  stopSound();
  const generation = audioGeneration;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    const play = () => {
      if (generation !== audioGeneration) return;
      const now = audioContext.currentTime;
      // Original, short positive two-note cue; no downloaded audio or student data.
      [740, 988].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = variant === 2 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency * (variant === 3 ? 1.125 : 1);
        const start = now + index * 0.085;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.09, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        voices.push({ oscillator, gain });
        oscillator.start(start); oscillator.stop(start + 0.15);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    };
    if (audioContext.state === 'suspended') audioContext.resume().then(play).catch(() => {});
    else play();
  } catch (_) { /* A missing/blocked audio device must never block answering. */ }
}
function correct(withSound = true) {
  clear();
  ensureElements();
  circle.hidden = false;
  status.textContent = '正解';
  if (withSound) playTone();
  hideTimer = setTimeout(clear, 750);
}
function mountSoundControl(host = document.body) {
  ensureElements();
  if (soundButton && soundButton.isConnected) return;
  const toolbar = document.createElement('div');
  toolbar.className = 'quiz-sound-control';
  soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.setAttribute('aria-label', '正解時の効果音');
  soundButton.addEventListener('click', () => setSoundEnabled(!soundEnabled));
  toolbar.appendChild(soundButton);
  host.prepend(toolbar);
  setSoundEnabled(false);
}
// Never restore an ON state from storage, reload, history or a cached document.
window.addEventListener('pagehide', () => { clear(); setSoundEnabled(false); });
window.addEventListener('pageshow', () => { clear(); setSoundEnabled(false); });
window.addEventListener('popstate', clear);

window.QuizFeedback = { correct, clear, mountSoundControl };
})();
