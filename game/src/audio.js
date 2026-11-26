// All sound is synthesised with WebAudio — no audio files, no network.
// An engine hum that follows the throttle, and short blips for guns, rings,
// pickups, hits and explosions. Everything is guarded so the game still
// runs (and screenshots still stage) where audio is unavailable.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return ctx !== null;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a low-pass, quiet until flying.
      engineOsc = ctx.createOscillator();
      const second = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      second.type = 'sawtooth';
      second.frequency.value = 55.7;
      engineOsc.connect(filter);
      second.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      second.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // A failed blip never stops the game.
    }
  }

  function noise(dur, vol, lowpass) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // See above.
    }
  }

  return {
    /** Call from any user gesture; also safe to call every frame. */
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    isMuted() { return muted; },
    /** Engine hum follows throttle 0..1 and boost. */
    engine(throttle, boosting) {
      if (!ctx || muted || !engineOsc) return;
      const target = 0.028 + throttle * 0.05 + (boosting ? 0.03 : 0);
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const freq = 48 + throttle * 55 + (boosting ? 25 : 0);
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1);
    },
    shoot() { tone(880, 0.07, 'square', 0.08, 220); },
    missile() { tone(320, 0.35, 'sawtooth', 0.1, 900); },
    ring() { tone(660, 0.12, 'sine', 0.16); tone(990, 0.18, 'sine', 0.14); },
    pickup() { tone(523, 0.09, 'sine', 0.15); setTimeout(() => tone(784, 0.12, 'sine', 0.15), 70); },
    hit() { noise(0.18, 0.25, 900); tone(160, 0.15, 'sawtooth', 0.12, 60); },
    explode() { noise(0.6, 0.4, 500); tone(90, 0.5, 'sawtooth', 0.2, 30); },
    bossAlarm() { tone(220, 0.25, 'square', 0.12, 220); setTimeout(() => tone(220, 0.25, 'square', 0.12, 220), 280); },
    land() { tone(392, 0.15, 'sine', 0.16); setTimeout(() => tone(523, 0.15, 'sine', 0.16), 130); setTimeout(() => tone(659, 0.3, 'sine', 0.16), 260); },
    warn() { tone(440, 0.1, 'square', 0.07, 440); },
  };
}
