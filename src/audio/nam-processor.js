// Runs on the Web Audio rendering thread (128-sample blocks, fixed by the browser —
// see https://github.com/Kutalia/neural-amp-modeler-react for the same caveat in the
// original open-source NAM-in-browser project).
//
class NamGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gateThresholdLinear = 0;

    this.port.onmessage = (event) => {
      const { type, payload } = event.data || {};

      if (type === 'load-model') {
        return;
      }
      if (type === 'set-gate') {
        this.gateThresholdLinear = payload <= -96 ? 0 : 10 ** (payload / 20);
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < input.length; i++) {
      if (this.gateThresholdLinear && Math.abs(input[i]) < this.gateThresholdLinear) {
        output[i] = 0;
      } else {
        output[i] = input[i];
      }
    }
    return true;
  }
}

registerProcessor('nam-gate-processor', NamGateProcessor);
