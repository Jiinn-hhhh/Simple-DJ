// audio/sampler.js — Synth-based sampler sounds + file-backed one-shots

const SAMPLER_SAMPLE_URLS = {
  reload: '/sfx/reload.wav',
  gunshot: '/sfx/gunshot.wav',
  down: '/sfx/down.wav',
  yea: '/sfx/yea.wav',
};

function getSamplerVolumeLevel() {
  return typeof this.samplerVolume === 'number'
    ? Math.max(0, Math.min(1, this.samplerVolume))
    : 1;
}

async function ensureSamplerAudioContext() {
  if (!this.audioContext || this.audioContext.state === 'closed') {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  return this.audioContext;
}

async function getSamplerBuffer(sampleKey) {
  await ensureSamplerAudioContext.call(this);

  if (!this.samplerBuffers) {
    this.samplerBuffers = {};
  }
  if (!this.samplerBufferPromises) {
    this.samplerBufferPromises = {};
  }

  if (this.samplerBuffers[sampleKey]) {
    return this.samplerBuffers[sampleKey];
  }
  if (this.samplerBufferPromises[sampleKey]) {
    return this.samplerBufferPromises[sampleKey];
  }

  const url = SAMPLER_SAMPLE_URLS[sampleKey];
  if (!url) {
    throw new Error(`Unknown sampler sample: ${sampleKey}`);
  }

  this.samplerBufferPromises[sampleKey] = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load sampler sample: ${sampleKey}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
    this.samplerBuffers[sampleKey] = buffer;
    return buffer;
  })();

  try {
    return await this.samplerBufferPromises[sampleKey];
  } finally {
    delete this.samplerBufferPromises[sampleKey];
  }
}

async function playSamplerBuffer(sampleKey, gainValue = 0.9) {
  if (!this.audioContext) await this.init();
  this.initMasterBus();
  if (this.audioContext.state === 'suspended') await this.audioContext.resume();

  const buffer = await getSamplerBuffer.call(this, sampleKey);
  const source = this.audioContext.createBufferSource();
  const gain = this.audioContext.createGain();

  source.buffer = buffer;
  source.connect(gain);
  gain.connect(this.masterNodes.input);
  gain.gain.setValueAtTime(gainValue * getSamplerVolumeLevel.call(this), this.audioContext.currentTime);

  source.start();
}

export function setSamplerVolume(volume) {
  this.samplerVolume = Math.max(0, Math.min(1, volume));
}

export async function preloadSamplerSamples() {
  await ensureSamplerAudioContext.call(this);
  await Promise.all(
    Object.keys(SAMPLER_SAMPLE_URLS).map((sampleKey) => getSamplerBuffer.call(this, sampleKey))
  );
}

export async function playAirHorn() {
  if (!this.audioContext) await this.init();
  this.initMasterBus();
  if (this.audioContext.state === 'suspended') await this.audioContext.resume();

  const t = this.audioContext.currentTime;
  const fund = 450;
  const freqs = [fund, fund * 1.05, fund * 1.5, fund * 1.55];

  const mainGain = this.audioContext.createGain();
  mainGain.connect(this.masterNodes.input);
  mainGain.gain.setValueAtTime(0.8 * getSamplerVolumeLevel.call(this), t);
  mainGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

  freqs.forEach(f => {
    const osc = this.audioContext.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 0.9, t + 0.4);
    osc.connect(mainGain);
    osc.start(t);
    osc.stop(t + 0.8);
  });
}

export async function playSiren() {
  if (!this.audioContext) await this.init();
  this.initMasterBus();
  if (this.audioContext.state === 'suspended') await this.audioContext.resume();

  const t = this.audioContext.currentTime;
  const osc = this.audioContext.createOscillator();
  const gain = this.audioContext.createGain();
  const filter = this.audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2500;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(this.masterNodes.input);

  osc.type = 'square';
  osc.frequency.setValueAtTime(650, t);

  const lfo = this.audioContext.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 8;
  const lfoAmp = this.audioContext.createGain();
  lfoAmp.gain.value = 50;
  lfo.connect(lfoAmp);
  lfoAmp.connect(osc.frequency);

  lfo.start(t);
  osc.start(t);

  const level = getSamplerVolumeLevel.call(this);
  gain.gain.setValueAtTime(0.5 * level, t);
  gain.gain.linearRampToValueAtTime(0.5 * level, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);

  osc.stop(t + 1.0);
  lfo.stop(t + 1.0);
}

export async function playReload() {
  await playSamplerBuffer.call(this, 'reload', 0.9);
}

export async function playGunshot() {
  await playSamplerBuffer.call(this, 'gunshot', 0.95);
}

export async function playDown() {
  await playSamplerBuffer.call(this, 'down', 0.85);
}

export async function playYea() {
  await playSamplerBuffer.call(this, 'yea', 0.9);
}
