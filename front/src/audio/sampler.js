// audio/sampler.js — Synth-based sampler sounds + file-backed one-shots

const SAMPLER_SAMPLE_URLS = {
  reload: '/sfx/reload.wav',
  gunshot: '/sfx/gunshot.wav',
  down: '/sfx/down.wav',
  yea: '/sfx/yea.wav',
};

async function getSamplerBuffer(sampleKey) {
  if (!this.audioContext) await this.init();

  if (!this.samplerBuffers) {
    this.samplerBuffers = {};
  }

  if (this.samplerBuffers[sampleKey]) {
    return this.samplerBuffers[sampleKey];
  }

  const url = SAMPLER_SAMPLE_URLS[sampleKey];
  if (!url) {
    throw new Error(`Unknown sampler sample: ${sampleKey}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load sampler sample: ${sampleKey}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
  this.samplerBuffers[sampleKey] = buffer;
  return buffer;
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
  gain.gain.setValueAtTime(gainValue, this.audioContext.currentTime);

  source.start();
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
  mainGain.gain.setValueAtTime(0.8, t);
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

  gain.gain.setValueAtTime(0.5, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.6);
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
