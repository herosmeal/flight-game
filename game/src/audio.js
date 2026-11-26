// Synthesised sound only: a WebAudio engine hum whose pitch follows the throttle, a chime
// for flying through a ring, a short jingle for a good landing and a thud for a crash. No audio
// files are loaded. Everything is guarded, so a browser without audio still plays silently.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let muted = false;
  let started = false;

  function ensureContext() {
    if (context !== null) return true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      return true;
    } catch {
      return false;
    }
  }

  /** Start the engine hum after the first gesture, so browsers allow the audio. */
  function startEngine() {
    if (started || !ensureContext()) return;
    try {
      started = true;
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'sine';
      engineOsc2.frequency.value = 104;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      engineOsc2.start();
    } catch {
      started = false;
    }
  }

  function tone(freq, startAt, duration, type, volume) {
    if (!ensureContext() || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(volume, context.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(context.currentTime + startAt);
      osc.stop(context.currentTime + startAt + duration + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    startEngine,
    /** Keep the hum in step with the throttle and speed; call every frame. */
    updateEngine(throttle, speedKt, flying) {
      if (!started || engineGain === null || muted) return;
      try {
        const target = flying ? 0.03 + throttle * 0.05 : 0.015;
        engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(48 + throttle * 36 + speedKt * 0.08, context.currentTime, 0.1);
        engineOsc2.frequency.setTargetAtTime(96 + throttle * 72 + speedKt * 0.16, context.currentTime, 0.1);
      } catch {
        // Ignore audio errors mid-flight.
      }
    },
    ringChime() {
      tone(880, 0, 0.18, 'sine', 0.16);
      tone(1318, 0.09, 0.28, 'sine', 0.16);
    },
    landingJingle() {
      tone(523, 0, 0.22, 'triangle', 0.18);
      tone(659, 0.14, 0.22, 'triangle', 0.18);
      tone(784, 0.28, 0.22, 'triangle', 0.18);
      tone(1046, 0.42, 0.4, 'triangle', 0.2);
    },
    crashThud() {
      if (!ensureContext() || muted) return;
      try {
        const length = Math.floor(context.sampleRate * 0.35);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < length; index += 1) {
          data[index] = (Math.random() * 2 - 1) * (1 - index / length);
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        const gain = context.createGain();
        gain.gain.value = 0.4;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        source.start();
      } catch {
        // Ignore audio errors mid-flight.
      }
    },
    toggleMute() {
      muted = !muted;
      if (engineGain !== null && context !== null) {
        try {
          engineGain.gain.setTargetAtTime(muted ? 0 : 0.04, context.currentTime, 0.05);
        } catch {
          // Ignore audio errors.
        }
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
