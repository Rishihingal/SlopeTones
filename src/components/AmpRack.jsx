import { useState } from 'react';

export default function AmpRack({ engine, cabAvailable }) {
  const [inputDb, setInputDb] = useState(0);
  const [outputDb, setOutputDb] = useState(0);
  const [gateDb, setGateDb] = useState(-96); // off by default
  const [cabOn, setCabOn] = useState(false);

  return (
    <div className="panel">
      <h2>Amp rack</h2>
      <div className="row">
        <div className="knob-group">
          <label>
            <span>Input gain</span>
            <span>{inputDb} dB</span>
          </label>
          <input
            type="range" min="-24" max="24" step="0.5" value={inputDb}
            onChange={(e) => { const v = Number(e.target.value); setInputDb(v); engine.setInputGainDb(v); }}
          />
        </div>
        <div className="knob-group">
          <label>
            <span>Output gain</span>
            <span>{outputDb} dB</span>
          </label>
          <input
            type="range" min="-24" max="24" step="0.5" value={outputDb}
            onChange={(e) => { const v = Number(e.target.value); setOutputDb(v); engine.setOutputGainDb(v); }}
          />
        </div>
        <div className="knob-group">
          <label>
            <span>Noise gate</span>
            <span>{gateDb <= -96 ? 'off' : `${gateDb} dB`}</span>
          </label>
          <input
            type="range" min="-96" max="-20" step="1" value={gateDb}
            onChange={(e) => { const v = Number(e.target.value); setGateDb(v); engine.setGateThresholdDb(v); }}
          />
        </div>
        <label className="knob-group">
          <span>Cab IR</span>
          <input
            type="checkbox"
            checked={cabOn}
            disabled={!cabAvailable}
            onChange={(e) => { setCabOn(e.target.checked); engine.setCabEnabled(e.target.checked); }}
          />
        </label>
      </div>
      <p className="hint">
        Keep the gate low (or off) if you're playing pinch harmonics — a high threshold cuts
        sustain before it rings out. Raise it only if you're fighting hiss on an idle signal.
      </p>
    </div>
  );
}
