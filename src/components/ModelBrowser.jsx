import { useRef, useState } from 'react';

export default function ModelBrowser({ engine, currentModelName, currentIrName, onModelLoaded, onIrLoaded }) {
  const [status, setStatus] = useState(null);
  const modelInputRef = useRef(null);
  const irInputRef = useRef(null);

  const onModelFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await engine.loadModel(buf);
    onModelLoaded?.(file.name);
    setStatus({ type: 'ok', text: `Loaded ${file.name}` });
  };

  const onIrFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await engine.loadImpulseResponse(buf);
    engine.setCabEnabled(true);
    onIrLoaded?.(file.name);
    setStatus({ type: 'ok', text: `Loaded IR ${file.name}` });
  };

  const clearModel = async () => {
    await engine.clearModel();
    if (modelInputRef.current) modelInputRef.current.value = '';
    onModelLoaded?.(null);
    setStatus({ type: 'ok', text: 'Amp model cleared.' });
  };

  const clearIr = () => {
    engine.clearImpulseResponse();
    if (irInputRef.current) irInputRef.current.value = '';
    onIrLoaded?.(null);
    setStatus({ type: 'ok', text: 'Cab IR cleared.' });
  };

  return (
    <div className="panel">
      <h2>Model</h2>
      <div className="row">
        <label className="knob-group">
          <span>Amp model (.nam)</span>
          <span className="file-picker">
            <button type="button" className="secondary" onClick={clearModel}>Clear</button>
            <input ref={modelInputRef} type="file" accept=".nam,application/json" onChange={onModelFile} />
          </span>
        </label>
        <label className="knob-group">
          <span>Cab IR (.wav)</span>
          <span className="file-picker">
            <button type="button" className="secondary" onClick={clearIr}>Clear</button>
            <input ref={irInputRef} type="file" accept="audio/wav,.wav" onChange={onIrFile} />
          </span>
        </label>
        <button className="secondary" onClick={() => { window.open('https://www.tone3000.com', '_blank'); }}>
          Browse TONE3000
        </button>
      </div>
      <div className="row">
        {currentModelName && <span className="tag">amp: {currentModelName}</span>}
        {currentIrName && <span className="tag">cab: {currentIrName}</span>}
      </div>
      {status && <p className={status.type === 'error' ? 'error' : 'hint'}>{status.text}</p>}
      <p className="hint">
        Browse models and tones directly on TONE3000, then download a model here when you
        return.
      </p>
    </div>
  );
}
