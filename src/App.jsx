import { useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine.js';
import DeviceSelector from './components/DeviceSelector.jsx';
import ModelBrowser from './components/ModelBrowser.jsx';
import AmpRack from './components/AmpRack.jsx';
import LevelMeter from './components/LevelMeter.jsx';
import Tuner from './components/Tuner.jsx';

export default function App() {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();

  const [started, setStarted] = useState(false);
  const [inputConnected, setInputConnected] = useState(false);
  const [modelName, setModelName] = useState(null);
  const [irName, setIrName] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tunerOpen, setTunerOpen] = useState(false);

  const start = async () => {
    await engineRef.current.init();
    engineRef.current.onWorkletMessage = (type, payload) => {
      if (type === 'error') setNotice({ type: 'error', text: payload });
      if (type === 'model-loaded') setNotice({ type: 'ok', text: 'Model loaded on the audio thread.' });
    };
    setStarted(true);
  };

  return (
    <div className="app">
      <h1>NAM + TONE3000 Amp Sim</h1>
      <p className="subtitle">
        Real-time neural amp modeling in the browser, with model browsing from TONE3000.
      </p>

      {!started && (
        <div className="panel">
          <button onClick={start}>Start audio engine</button>
          <p className="hint">
            Browsers require a user gesture before audio can start — this initializes the
            AudioContext and loads the processing worklet.
          </p>
        </div>
      )}

      {started && (
        <>
          <DeviceSelector engine={engineRef.current} onConnected={() => setInputConnected(true)} />
          <div className="panel tuner-launcher">
            <div>
              <h2>Tuner</h2>
              <p className="hint">Open the tuner for guided or free tuning.</p>
            </div>
            <button onClick={() => setTunerOpen(true)} type="button">Open tuner</button>
          </div>
          {tunerOpen && <Tuner engine={engineRef.current} active={inputConnected} onClose={() => setTunerOpen(false)} />}
          <ModelBrowser
            engine={engineRef.current}
            currentModelName={modelName}
            currentIrName={irName}
            onModelLoaded={setModelName}
            onIrLoaded={setIrName}
          />
          <AmpRack engine={engineRef.current} cabAvailable={Boolean(irName)} />
          <LevelMeter engine={engineRef.current} active={inputConnected} />
        </>
      )}

      {notice && <p className={notice.type === 'error' ? 'error' : 'hint'}>{notice.text}</p>}
    </div>
  );
}
