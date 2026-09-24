import { useEffect, useState } from 'react';

export default function DeviceSelector({ engine, onConnected }) {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((all) => {
      setDevices(all.filter((d) => d.kind === 'audioinput'));
    });
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await engine.connectInput(selected || undefined);
      // Labels are blank until permission is granted; refresh the list now that it is.
      const all = await engine.listInputDevices();
      setDevices(all);
      onConnected?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="panel">
      <h2>Input</h2>
      <div className="row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <button onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect interface'}
        </button>
      </div>
      <p className="hint">
        Pick your audio interface here (e.g. your PocketMaster). If you hear a double/phasey
        signal, lower the interface's own buffer size rather than this app's — that's an
        interface-side dry+wet monitoring issue, not this app.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
