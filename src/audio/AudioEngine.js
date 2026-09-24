// Owns the Web Audio graph:
//   input (mic/interface) -> inputGain -> [nam-processor worklet] -> (optional IR convolver)
//   -> outputGain -> analyser -> destination
//
// The neural amp inference runs inside the package's AudioWorklet. The local worklet only
// handles the input gate, keeping the graph controls independent of the NAM engine.

import { NamEngine } from 'neural-amp-modeler-wasm/engine';

const WORKLET_URL = new URL('./nam-processor.js', import.meta.url);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.inputNode = null;
    this.namNode = null;
    this.gateNode = null;
    this.namEngine = null;
    this.irNode = null;
    this.inputGain = null;
    this.outputGain = null;
    this.analyser = null;
    this.mediaStream = null;
    this.cabEnabled = false;
    this.gateThresholdDb = -96;
    this.onWorkletMessage = null;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 0.01,
    });

    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    this.namEngine = await NamEngine.attach(this.ctx);

    this.inputGain = this.ctx.createGain();
    this.outputGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.gateNode = new AudioWorkletNode(this.ctx, 'nam-gate-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.namNode = await this.namEngine.createNode();

    this.irNode = this.ctx.createConvolver();
    this.irNode.normalize = true;

    this._connectInputChain();
    this._connectOutputChain();
  }

  _connectInputChain() {
    this.inputGain.disconnect();
    this.gateNode.disconnect();
    if (this.gateThresholdDb <= -96) {
      this.inputGain.connect(this.namNode);
    } else {
      this.inputGain.connect(this.gateNode);
      this.gateNode.connect(this.namNode);
    }
  }

  _connectOutputChain() {
    this.namNode.disconnect();
    this.irNode.disconnect();
    if (this.cabEnabled && this.irNode.buffer) {
      this.namNode.connect(this.irNode);
      this.irNode.connect(this.outputGain);
    } else {
      this.namNode.connect(this.outputGain);
    }
    this.outputGain.disconnect();
    this.outputGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async listInputDevices() {
    // Labels are only populated after a getUserMedia permission grant.
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }

  async connectInput(deviceId) {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        latency: { ideal: 0 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.inputNode?.disconnect();
    this.inputNode = this.ctx.createMediaStreamSource(this.mediaStream);
    this.inputNode.connect(this.inputGain);
  }

  async loadModel(arrayBuffer) {
    const json = new TextDecoder().decode(arrayBuffer);
    const info = await this.namNode.loadModel(json);
    this.onWorkletMessage?.('model-loaded', info);
    return info;
  }

  async clearModel() {
    await this.namNode?.unloadModel();
  }

  async loadImpulseResponse(arrayBuffer) {
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.irNode.buffer = this._trimImpulseResponse(audioBuffer);
    this._connectOutputChain();
  }

  _trimImpulseResponse(audioBuffer) {
    const threshold = 0.0001;
    let firstSample = audioBuffer.length;
    const channelData = [];
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      channelData.push(data);
      for (let sample = 0; sample < data.length; sample++) {
        if (Math.abs(data[sample]) >= threshold) {
          firstSample = Math.min(firstSample, sample);
          break;
        }
      }
    }
    if (firstSample === 0 || firstSample === audioBuffer.length) return audioBuffer;

    const trimmed = this.ctx.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length - firstSample,
      audioBuffer.sampleRate,
    );
    for (let channel = 0; channel < channelData.length; channel++) {
      trimmed.copyToChannel(channelData[channel].subarray(firstSample), channel);
    }
    return trimmed;
  }

  clearImpulseResponse() {
    this.irNode.buffer = null;
    this.setCabEnabled(false);
  }

  setCabEnabled(enabled) {
    this.cabEnabled = enabled;
    this._connectOutputChain();
  }

  setInputGainDb(db) {
    this.inputGain?.gain.setTargetAtTime(10 ** (db / 20), this.ctx.currentTime, 0.01);
  }

  setOutputGainDb(db) {
    this.outputGain?.gain.setTargetAtTime(10 ** (db / 20), this.ctx.currentTime, 0.01);
  }

  setGateThresholdDb(db) {
    this.gateThresholdDb = db;
    this._connectInputChain();
    this.gateNode?.port.postMessage({ type: 'set-gate', payload: db });
  }

  getLevel() {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  suspend() { return this.ctx?.suspend(); }
  resume() { return this.ctx?.resume(); }
}
