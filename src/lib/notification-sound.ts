// Short "ding" played on a live notification push — plain Web Audio API,
// no sound asset to ship/load. Browsers block audio before any user gesture
// on the page, but by the time a socket push arrives the user has almost
// always already interacted (login click, nav, etc.); if not, play() just
// silently fails and the notification still lands, sound is a bonus.

let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // Sound is a bonus, never let it break the notification itself.
  }
}
