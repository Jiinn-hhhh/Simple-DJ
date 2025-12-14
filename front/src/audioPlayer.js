// Audio Player using Web Audio API
class AudioPlayer {
  constructor() {
    this.audioContext = null;
    // Structure: { trackId: { stemName: AudioBuffer } }
    this.audioBuffers = {};
    // Structure: { trackId: { stemName: AudioBufferSourceNode } }
    this.sourceNodes = {};
    // Structure: { trackId: { stemName: GainNode } }
    this.stemGainNodes = {};
    // Structure: { trackId: GainNode } (Master gain for the track)
    this.trackGainNodes = {};
    // Structure: { trackId: BiquadFilterNode }
    this.trackFilterNodes = {};
    // Structure: { trackId: { low: Gain, ... } }
    this.trackEqNodes = {};
    // Structure: { trackId: AnalyserNode }
    this.analyserNodes = {};

    this.isPlaying = {}; // { trackId: boolean }
    this.startTimes = {}; // { trackId: contextTime }
    this.playbackRates = {}; // { trackId: rate }

    // Default stems if not specified
    this.defaultStems = ['drums', 'bass', 'vocals', 'other'];

    // Mute State Persistence { trackId: { stemName: boolean } }
    this.stemMuteStates = {};

    // Offset state for time tracking
    this.pauseOffsets = {};
    this.loopPoints = {};
  }

  // Initialize Audio Context
  async init() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  getAnalyser(trackId) {
    // Return the analyser node if it exists, otherwise return null or create a dummy one?
    // React might call this before setupTrackGraph is called (e.g. initial render).
    // So we should return null, and handle null in Deck. Or ensure setupTrackGraph is called?
    // setupTrackGraph is called lazily.
    // If we return undefined, Deck might crash if it expects an object.
    return this.analyserNodes[trackId] || null;
  }

  /**
   * Load a specific stem for a track
   * @param {string} trackId 
   * @param {string} stemName 'full' or specific stem name
   * @param {string} audioUrl 
   */
  async loadAudio(trackId, stemName, audioUrl) {
    await this.init();

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      if (!this.audioBuffers[trackId]) {
        this.audioBuffers[trackId] = {};
      }
      this.audioBuffers[trackId][stemName] = audioBuffer;

      return audioBuffer;
    } catch (error) {
      console.error(`Error loading audio for ${trackId}/${stemName}:`, error);
      throw error;
    }
  }


  initMasterBus() {
    if (this.masterBusInitialized || !this.audioContext) return;

    this.masterNodes = {};

    // 1. Master Sum
    this.masterNodes.input = this.audioContext.createGain();

    // 2. Master Gain
    this.masterNodes.gain = this.audioContext.createGain();

    // 3. Master Filter (XY Pad X-Axis)
    this.masterNodes.filter = this.audioContext.createBiquadFilter();
    this.masterNodes.filter.type = 'peaking';
    this.masterNodes.filter.frequency.value = 1000;
    this.masterNodes.filter.gain.value = 0;

    // 4. Reverb (Y-Axis UP)
    this.masterNodes.convolver = this.audioContext.createConvolver();
    // Create impulse response: 3 seconds (was 2), 2.0 decay
    this.masterNodes.convolver.buffer = this._createReverbImpulse(3.0, 2.0);
    this.masterNodes.reverbGain = this.audioContext.createGain();
    this.masterNodes.reverbGain.gain.value = 0;

    // 5. Distortion (Y-Axis DOWN)
    this.masterNodes.distortion = this.audioContext.createWaveShaper();
    this.masterNodes.distortion.curve = this._makeDistortionCurve(400);
    this.masterNodes.distortion.oversample = '4x';
    this.masterNodes.distortionGain = this.audioContext.createGain();
    this.masterNodes.distortionGain.gain.value = 0;

    // WIRING
    // Input -> Gain -> Filter
    this.masterNodes.input.connect(this.masterNodes.gain);
    this.masterNodes.gain.connect(this.masterNodes.filter);

    // Split from Filter
    // 1. Dry
    this.masterNodes.filter.connect(this.audioContext.destination);

    // 2. Reverb Path
    this.masterNodes.filter.connect(this.masterNodes.convolver);
    this.masterNodes.convolver.connect(this.masterNodes.reverbGain);
    this.masterNodes.reverbGain.connect(this.audioContext.destination);

    // 3. Distortion Path
    this.masterNodes.filter.connect(this.masterNodes.distortion);
    this.masterNodes.distortion.connect(this.masterNodes.distortionGain);
    this.masterNodes.distortionGain.connect(this.audioContext.destination);

    this.masterBusInitialized = true;
  }

  _createReverbImpulse(duration, decay) {
    const rate = this.audioContext.sampleRate;
    const length = rate * duration;
    const impulse = this.audioContext.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      let n = i < length * 0.01 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      left[i] = n;
      right[i] = n;
    }
    return impulse;
  }

  _makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * Setup the audio graph for a track (Gain -> Filter -> MasterBus)
   * @param {string} trackId 
   */
  setupTrackGraph(trackId) {
    this.initMasterBus(); // Ensure master bus exists

    if (!this.trackGainNodes[trackId]) {
      // Master Gain for Track
      const trackGain = this.audioContext.createGain();
      trackGain.gain.value = 1.0;

      this.trackEqNodes[trackId] = {
        lowGain: this.audioContext.createGain(),
        midGain: this.audioContext.createGain(),
        highGain: this.audioContext.createGain(),
        // Filters for crossover
        lowFilter: this.audioContext.createBiquadFilter(),
        midLowFilter: this.audioContext.createBiquadFilter(), // Highpass for mid
        midHighFilter: this.audioContext.createBiquadFilter(), // Lowpass for mid
        highFilter: this.audioContext.createBiquadFilter()
      };

      // --- Parametric Isolator Configuration ---
      // Crossover Frequencies
      const LOW_CROSSOVER = 300;
      const HIGH_CROSSOVER = 3000;

      // 1. Low Band: LowPass @ 300Hz
      this.trackEqNodes[trackId].lowFilter.type = 'lowpass';
      this.trackEqNodes[trackId].lowFilter.frequency.value = LOW_CROSSOVER;
      this.trackEqNodes[trackId].lowFilter.Q.value = 0.707; // Butterworth-ish

      // 2. Mid Band: HighPass @ 300Hz -> LowPass @ 3000Hz
      this.trackEqNodes[trackId].midLowFilter.type = 'highpass';
      this.trackEqNodes[trackId].midLowFilter.frequency.value = LOW_CROSSOVER;
      this.trackEqNodes[trackId].midLowFilter.Q.value = 0.707;

      this.trackEqNodes[trackId].midHighFilter.type = 'lowpass';
      this.trackEqNodes[trackId].midHighFilter.frequency.value = HIGH_CROSSOVER;
      this.trackEqNodes[trackId].midHighFilter.Q.value = 0.707;

      // 3. High Band: HighPass @ 3000Hz
      this.trackEqNodes[trackId].highFilter.type = 'highpass';
      this.trackEqNodes[trackId].highFilter.frequency.value = HIGH_CROSSOVER;
      this.trackEqNodes[trackId].highFilter.Q.value = 0.707;

      // Initialize Gains (1.0 = Flat)
      this.trackEqNodes[trackId].lowGain.gain.value = 1.0;
      this.trackEqNodes[trackId].midGain.gain.value = 1.0;
      this.trackEqNodes[trackId].highGain.gain.value = 1.0;

      // Filter for Track (Existing Master Filter)
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.Q.value = 1;

      // --- WIRING (Parallel) ---
      // Input (TrackGain) -> [LowChain, MidChain, HighChain] -> Sum -> Filter

      // Low Chain
      trackGain.connect(this.trackEqNodes[trackId].lowFilter);
      this.trackEqNodes[trackId].lowFilter.connect(this.trackEqNodes[trackId].lowGain);
      this.trackEqNodes[trackId].lowGain.connect(filter);

      // Mid Chain
      trackGain.connect(this.trackEqNodes[trackId].midLowFilter);
      this.trackEqNodes[trackId].midLowFilter.connect(this.trackEqNodes[trackId].midHighFilter);
      this.trackEqNodes[trackId].midHighFilter.connect(this.trackEqNodes[trackId].midGain);
      this.trackEqNodes[trackId].midGain.connect(filter);

      // High Chain
      trackGain.connect(this.trackEqNodes[trackId].highFilter);
      this.trackEqNodes[trackId].highFilter.connect(this.trackEqNodes[trackId].highGain);
      this.trackEqNodes[trackId].highGain.connect(filter);

      // Output
      // Create Analyser
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      this.analyserNodes[trackId] = analyser;

      filter.connect(analyser);

      // Changed: Connect to Master Bus Input instead of Destination
      analyser.connect(this.masterNodes.input);

      this.trackGainNodes[trackId] = trackGain;
      this.trackFilterNodes[trackId] = filter;
    }
  }

  // --- Sampler / SFX ---

  async playAirHorn() {
    if (!this.audioContext) await this.init();
    this.initMasterBus();
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    const t = this.audioContext.currentTime;

    // Oscillators for "Air Horn" (Stacking saws/squares at dissonant intervals)
    // Higher pitch: 450Hz
    const fund = 450;
    const freqs = [fund, fund * 1.05, fund * 1.5, fund * 1.55];

    const mainGain = this.audioContext.createGain();
    mainGain.connect(this.masterNodes.input); // Send to master bus

    // Envelope
    mainGain.gain.setValueAtTime(0.8, t);
    mainGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

    freqs.forEach(f => {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      // Pitch drop per "honk"
      osc.frequency.linearRampToValueAtTime(f * 0.9, t + 0.4);
      osc.connect(mainGain);
      osc.start(t);
      osc.stop(t + 0.8);
    });
  }

  async playSiren() {
    if (!this.audioContext) await this.init();
    this.initMasterBus();
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    const t = this.audioContext.currentTime;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    // Add LPF to soften the sound
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500; // Cut highs

    // Chain: Osc -> Filter -> Gain -> Master
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNodes.input);

    // Dub Siren LFO
    osc.type = 'square';
    osc.frequency.setValueAtTime(650, t);

    // LFO for pitch
    const lfo = this.audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 8;
    const lfoAmp = this.audioContext.createGain();
    lfoAmp.gain.value = 50;
    lfo.connect(lfoAmp);
    lfoAmp.connect(osc.frequency);

    lfo.start(t);
    osc.start(t);

    // Envelope (Even Shorter: 1.0s total)
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.6); // Sustain 0.6s
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0); // Fade out

    osc.stop(t + 1.0);
    lfo.stop(t + 1.0);
  }

  setMasterEffect(x, y) {
    if (!this.masterNodes) return;

    const now = this.audioContext.currentTime;

    // X-Axis: Filter (0.5 = neutral, <0.5 LPF, >0.5 HPF)
    if (x > 0.45 && x < 0.55) {
      // Bypass
      this.masterNodes.filter.frequency.setTargetAtTime(1000, now, 0.1);
      this.masterNodes.filter.gain.setTargetAtTime(0, now, 0.1);
      this.masterNodes.filter.type = 'peaking';
    } else if (x <= 0.45) {
      // LPF
      this.masterNodes.filter.type = 'lowpass';
      const norm = Math.max(0.001, x / 0.45);
      const freq = 20 * Math.pow(1000, norm);
      this.masterNodes.filter.frequency.setTargetAtTime(freq, now, 0.1);
      this.masterNodes.filter.Q.value = 2;
    } else {
      // HPF
      this.masterNodes.filter.type = 'highpass';
      const norm = (x - 0.55) / 0.45;
      const freq = 20 * Math.pow(1000, norm);
      this.masterNodes.filter.frequency.setTargetAtTime(freq, now, 0.1);
      this.masterNodes.filter.Q.value = 2;
    }

    // Y-Axis: Up = Reverb (>0.5), Down = Distortion (<0.5)
    // Center (0.5) = Dry

    let reverbAmt = 0;
    let distAmt = 0;

    if (y >= 0.5) {
      // UP: Reverb
      // y: 0.5 -> 1.0
      // val: 0 -> 1.5 (Boosted)
      reverbAmt = (y - 0.5) * 3;
    } else {
      // DOWN: Distortion
      // y: 0.5 -> 0.0
      // val: 0 -> 1
      distAmt = (0.5 - y) * 2;
    }

    // Apply with smoothing
    this.masterNodes.reverbGain.gain.setTargetAtTime(reverbAmt, now, 0.1);
    this.masterNodes.distortionGain.gain.setTargetAtTime(distAmt * 0.8, now, 0.1); // Scale dist
  }


  /**
   * Play a track (all loaded stems)
   * @param {string} trackId 
   * @param {number} offset Time offset in seconds
   * @param {number} when Absolute context time to start (for sync)
   */
  async play(trackId, offset = 0, when = 0) {
    await this.init();
    this.setupTrackGraph(trackId);

    // Stop if already playing to prevent overlap
    if (this.isPlaying[trackId]) {
      this.stop(trackId);
    }

    if (!this.audioBuffers[trackId]) {
      console.warn(`No buffers loaded for track ${trackId}`);
      return;
    }

    const startTime = when > 0 ? when : this.audioContext.currentTime;
    this.startTimes[trackId] = startTime - offset; // Remember "virtual" start time

    // Play all loaded stems for this track
    Object.keys(this.audioBuffers[trackId]).forEach(stemName => {
      this.playStem(trackId, stemName, startTime, offset);
    });

    this.isPlaying[trackId] = true;
  }

  playStem(trackId, stemName, startTime, offset) {
    const buffer = this.audioBuffers[trackId][stemName];
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    // Create stem-specific gain (for muting/volume)
    const stemGain = this.audioContext.createGain();

    // Check persisted mute state
    const isMuted = this.stemMuteStates[trackId] && this.stemMuteStates[trackId][stemName];
    stemGain.gain.value = isMuted ? 0.0 : 1.0;

    // Connect: Source -> StemGain -> TrackMasterGain
    source.connect(stemGain);
    stemGain.connect(this.trackGainNodes[trackId]);

    // Apply playback rate
    const rate = this.playbackRates[trackId] || 1.0;
    source.playbackRate.value = rate;

    // Start playback
    // source.start(when, offset, duration)
    // Note: offset needs to be adjusted by playback rate if we were doing complex seeking,
    // but for simple start, this is fine.
    source.start(startTime, offset);

    // Store nodes
    if (!this.sourceNodes[trackId]) this.sourceNodes[trackId] = {};
    if (!this.stemGainNodes[trackId]) this.stemGainNodes[trackId] = {};

    this.sourceNodes[trackId][stemName] = source;
    this.stemGainNodes[trackId][stemName] = stemGain;

    source.onended = () => {
      // Simple check: if this source is still the active one, mark stopped
      // (In a real app, we'd need more robust state management)
    };
  }

  stop(trackId) {
    if (this.sourceNodes[trackId]) {
      Object.values(this.sourceNodes[trackId]).forEach(node => {
        try { node.stop(); } catch (e) { }
      });
      this.sourceNodes[trackId] = {};
      this.stemGainNodes[trackId] = {};
    }
    this.isPlaying[trackId] = false;
  }

  /**
   * Mute or Unmute a specific stem
   * @param {string} trackId 
   * @param {string} stemName 
   * @param {boolean} isMuted 
   */
  muteStem(trackId, stemName, isMuted) {
    // Determine persistency
    if (!this.stemMuteStates[trackId]) this.stemMuteStates[trackId] = {};
    this.stemMuteStates[trackId][stemName] = isMuted;

    if (this.stemGainNodes[trackId] && this.stemGainNodes[trackId][stemName]) {
      // Smooth transition to avoid clicks
      const gainNode = this.stemGainNodes[trackId][stemName];
      const currentTime = this.audioContext.currentTime;
      gainNode.gain.cancelScheduledValues(currentTime);
      gainNode.gain.setTargetAtTime(isMuted ? 0 : 1, currentTime, 0.05);
    }
  }

  setVolume(trackId, volume) {
    this.setupTrackGraph(trackId);
    const gainNode = this.trackGainNodes[trackId];
    const currentTime = this.audioContext.currentTime;
    gainNode.gain.cancelScheduledValues(currentTime);
    gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), currentTime, 0.05);
  }

  setPlaybackRate(trackId, rate) {
    if (this.isPlaying[trackId] && this.startTimes[trackId] !== null) {
      // Re-anchor time tracking to prevent drift when rate changes
      const oldRate = this.playbackRates[trackId] || 1.0;
      const currentTime = this.audioContext.currentTime;
      const elapsed = currentTime - this.startTimes[trackId];
      const currentBufferPos = (this.pauseOffsets[trackId] || 0) + (elapsed * oldRate);

      this.pauseOffsets[trackId] = currentBufferPos;
      this.startTimes[trackId] = currentTime;
    }

    this.playbackRates[trackId] = rate;
    if (this.sourceNodes[trackId]) {
      Object.values(this.sourceNodes[trackId]).forEach(source => {
        source.playbackRate.value = rate;
      });
    }
  }

  /**
   * Set Low-pass / High-pass filter
   * @param {string} trackId 
   * @param {string} type 'lowpass' | 'highpass' | 'allpass' (off)
   * @param {number} value Frequency value (0-1 normalized, mapped to log scale)
   */
  setFilter(trackId, value) {
    this.setupTrackGraph(trackId);
    const filter = this.trackFilterNodes[trackId];

    // Value: 0 (Low) -> 0.5 (Neutral) -> 1.0 (High)
    // We'll implement a simple DJ filter:
    // 0.0 - 0.45: Low Pass (20Hz - 20kHz)
    // 0.45 - 0.55: Off
    // 0.55 - 1.0: High Pass (20Hz - 20kHz)

    const currentTime = this.audioContext.currentTime;

    if (value > 0.45 && value < 0.55) {
      // Neutral zone - open filter
      filter.type = 'peaking'; // effectively bypass
      filter.frequency.setTargetAtTime(1000, currentTime, 0.1);
      filter.gain.setTargetAtTime(0, currentTime, 0.1);
    } else if (value <= 0.45) {
      // Low Pass
      filter.type = 'lowpass';
      // Map 0.0-0.45 to 20Hz-20000Hz (logarithmic)
      // Normalized x = value / 0.45
      const normalized = Math.max(0.001, value / 0.45);
      const freq = 20 * Math.pow(1000, normalized); // Approx mapping
      filter.frequency.setTargetAtTime(freq, currentTime, 0.1);
      filter.Q.value = 1;
    } else {
      // High Pass
      filter.type = 'highpass';
      // Map 0.55-1.0 to 20Hz-20000Hz
      const normalized = (value - 0.55) / 0.45;
      const freq = 20 * Math.pow(1000, normalized);
      filter.frequency.setTargetAtTime(freq, currentTime, 0.1);
      filter.Q.value = 1;
    }
  }

  /**
   * Set EQ Gain (Isolator)
   * @param {string} trackId 
   * @param {string} band 'low' | 'mid' | 'high'
   * @param {number} value Linear Gain (0.0 to 2.0+)
   */
  setEq(trackId, band, value) {
    this.setupTrackGraph(trackId);
    // band: 'low', 'mid', 'high' -> map to lowGain, midGain, highGain
    const gainNodeName = `${band}Gain`;

    if (this.trackEqNodes[trackId] && this.trackEqNodes[trackId][gainNodeName]) {
      const node = this.trackEqNodes[trackId][gainNodeName];
      const currentTime = this.audioContext.currentTime;
      node.gain.setTargetAtTime(value, currentTime, 0.05); // Faster response for kills
    }
  }

  getIsPlaying(trackId) {
    return this.isPlaying[trackId] || false;
  }

  // --- Effect & Logic ---

  // Loop: set loop IN point
  setLoopIn(deckId, trackBpm) {
    if (!this.sourceNodes || !this.sourceNodes[deckId]) return;
    if (this.startTimes[deckId] === null) return; // Not playing, can't loop (simplification)

    // Calculate current buffer position
    const rate = this.playbackRates?.[deckId] || 1.0;
    const playStartTime = this.startTimes[deckId];
    const offset = this.pauseOffsets[deckId] || 0;
    const elapsed = this.audioContext.currentTime - playStartTime;
    const bufferCurrentTime = offset + (elapsed * rate);

    // Quantize to nearest beat
    const beatDuration = 60 / trackBpm;
    const currentBeat = bufferCurrentTime / beatDuration;
    const nearestBeatIndex = Math.round(currentBeat);
    const quantizeTime = nearestBeatIndex * beatDuration;

    if (!this.loopPoints) this.loopPoints = {};
    if (!this.loopPoints[deckId]) this.loopPoints[deckId] = {};

    this.loopPoints[deckId].start = quantizeTime;
  }

  // Loop: set loop OUT point and ENABLE loop
  setLoopOut(deckId, trackBpm) {
    if (!this.sourceNodes || !this.sourceNodes[deckId] || !this.loopPoints?.[deckId]) return;

    // Calculate current buffer position
    const rate = this.playbackRates?.[deckId] || 1.0;
    const playStartTime = this.startTimes[deckId];
    const offset = this.pauseOffsets[deckId] || 0;
    const elapsed = this.audioContext.currentTime - playStartTime;
    const bufferCurrentTime = offset + (elapsed * rate);

    // Quantize to nearest beat
    const beatDuration = 60 / trackBpm;
    const currentBeat = bufferCurrentTime / beatDuration;
    const nearestBeatIndex = Math.round(currentBeat);
    let quantizeTime = nearestBeatIndex * beatDuration;

    const start = this.loopPoints[deckId].start;

    // Ensure end is after start
    if (quantizeTime <= start) {
      // Force at least 1 beat
      quantizeTime = start + beatDuration;
    }

    const end = quantizeTime;

    // Apply to all sources
    const sources = this.sourceNodes[deckId];
    Object.values(sources).forEach(source => {
      if (!source || !source.buffer) return;

      // Check bounds
      let safeStart = Math.max(0, start);
      let safeEnd = Math.min(source.buffer.duration, end);

      if (safeEnd <= safeStart) return; // Invalid loop

      source.loopStart = safeStart;
      source.loopEnd = safeEnd;
      source.loop = true;
    });

    this.loopPoints[deckId].active = true;
  }

  exitLoop(deckId) {
    if (!this.sourceNodes || !this.sourceNodes[deckId]) return;

    // Calculate precise current position within the loop to re-anchor time
    // Logic: If we were looping, the linear projection (currentTime - startTime) is way ahead.
    // We need to snap it back to reality.

    // 1. Get the loop setting that was active
    const loopInfo = this.loopPoints?.[deckId];

    if (loopInfo && loopInfo.active) {
      const start = loopInfo.start;
      const end = this.sourceNodes[deckId][Object.keys(this.sourceNodes[deckId])[0]].loopEnd; // loopEnd is on source
      // Note: we need the source's loopEnd because we might have qualified it.
      // But actually, let's just grab the stored loopPoints, assuming they match.
      // Better: read from source directly.

      const source = Object.values(this.sourceNodes[deckId])[0];
      if (source && source.loop) {
        const loopStart = source.loopStart;
        const loopEnd = source.loopEnd;
        const loopDuration = loopEnd - loopStart;

        // Calculate where the "linear clock" thinks we are
        const rate = this.playbackRates?.[deckId] || 1.0;
        const playStartTime = this.startTimes[deckId];
        const offset = this.pauseOffsets[deckId] || 0;
        const elapsed = this.audioContext.currentTime - playStartTime;
        const bufferLinearTime = offset + (elapsed * rate);

        // Calculate where we ACTUALLY are inside the loop
        // Position = loopStart + ( (linearTime - loopStart) % loopDuration )
        let actualPosition = bufferLinearTime;
        if (bufferLinearTime > loopStart) {
          const timeInsideLoop = (bufferLinearTime - loopStart) % loopDuration;
          actualPosition = loopStart + timeInsideLoop;
        }

        // RE-ANCHOR
        // We pretend we just "started playing" from this actualPosition at this exact currentTime.
        this.pauseOffsets[deckId] = actualPosition;
        this.startTimes[deckId] = this.audioContext.currentTime;
      }
    }

    Object.values(this.sourceNodes[deckId]).forEach(source => {
      if (source) source.loop = false;
    });

    if (this.loopPoints && this.loopPoints[deckId]) {
      // Reset state completely so next loop starts fresh
      delete this.loopPoints[deckId];
    }
  }

  // Seek: Jump to percentage (0.0 - 1.0)
  async seek(deckId, percent) {
    // 1. Stop current
    // 2. Calculate new offset
    // 3. Play from new offset

    // Need track duration. 
    // We can get it from buffer of 'full' or any stem.
    let duration = 0;
    const buffers = this.audioBuffers[deckId];
    if (buffers && buffers['full']) duration = buffers['full'].duration;
    else if (buffers && Object.values(buffers)[0]) duration = Object.values(buffers)[0].duration;

    if (!duration) return;

    const newOffset = duration * percent;

    // Save state
    this.pauseOffsets[deckId] = newOffset;

    // If currently playing, restart from there.
    // If paused, just update offset so next Play starts there.

    if (this.startTimes[deckId] !== null) {
      // Was playing
      await this.stop(deckId);
      // Restore "Playing" state immediately
      // We need to call play() but play() uses stored offset.
      this.play(deckId); // This uses existing play logic which reads pauseOffsets
    }
  }

  cleanup() {
    try {
      if (this.sourceNodes) {
        Object.keys(this.sourceNodes).forEach(trackId => this.stop(trackId));
      }

      if (this.audioContext) {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      }
    } catch (err) {
      console.warn("Error during AudioPlayer cleanup:", err);
    } finally {
      this.audioContext = null;
      this.sourceNodes = {};
      this.stemGainNodes = {};
      this.trackGainNodes = {};
      this.trackFilterNodes = {};
    }
  }
}

export default AudioPlayer;
