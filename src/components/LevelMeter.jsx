import { useEffect, useRef, useState } from 'react';

export default function LevelMeter({ engine, active }) {
  const [level, setLevel] = useState(0);
  const rafRef = useRef();

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      setLevel(engine.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, active]);

  const pct = Math.min(100, Math.round(level * 220));

  return (
    <div className="panel">
      <h2>Output level</h2>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
