import { useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';
import tunings from '../data/tunings.json';

const tuningKeys = Object.keys(tunings);
const A4 = 440;

function noteFromFrequency(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / A4));
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[(midi + 120) % 12]}${Math.floor(midi / 12) - 1}`;
}

function centsFromFrequency(frequency, targetFrequency) {
  return Math.round(1200 * Math.log2(frequency / targetFrequency));
}

function nearestTargetFrequency(frequency, strings) {
  return strings.reduce((nearest, string) => (
    Math.abs(Math.log2(frequency / string.frequency)) < Math.abs(Math.log2(frequency / nearest))
      ? string.frequency
      : nearest
  ), strings[0].frequency);
}

export default function Tuner({ engine, active, onClose }) {
  const [tuningKey, setTuningKey] = useState(tuningKeys[0]);
  const [stringIndex, setStringIndex] = useState(0);
  const [reading, setReading] = useState(null);
  const [tunedStrings, setTunedStrings] = useState([]);
  const [freeMode, setFreeMode] = useState(false);
  const rafRef = useRef();
  const detectorRef = useRef(null);
  const tuning = tunings[tuningKey];
  const target = tuning.strings[stringIndex];

  useEffect(() => {
    setStringIndex(0);
    setReading(null);
    setTunedStrings([]);
    setFreeMode(false);
  }, [tuningKey]);

  useEffect(() => {
    if (!active) return undefined;
    const detect = () => {
      const buffer = engine.getTunerBuffer();
      if (buffer) {
        detectorRef.current ??= PitchDetector.forFloat32Array(buffer.length);
        const [frequency, clarity] = detectorRef.current.findPitch(buffer, engine.ctx.sampleRate);
        if (clarity > 0.85 && frequency > 40 && frequency < 600) {
          setReading({
            frequency,
            note: noteFromFrequency(frequency),
            cents: centsFromFrequency(frequency, target.frequency),
          });
        }
      }
      rafRef.current = requestAnimationFrame(detect);
    };
    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, engine, target]);

  const cents = reading?.cents ?? null;
  const status = cents === null ? 'Play a string' : Math.abs(cents) <= 5 ? 'In tune' : cents < 0 ? 'Tune up' : 'Tune down';
  const statusClass = cents === null ? 'waiting' : Math.abs(cents) <= 5 ? 'in-tune' : cents < 0 ? 'tune-up' : 'tune-down';
  const noteIsInTuning = reading && tuning.strings.some((string) => string.name === reading.note);
  const displayStatusClass = freeMode && reading ? (noteIsInTuning ? 'in-tune' : statusClass) : statusClass;
  const freeCents = reading ? centsFromFrequency(reading.frequency, nearestTargetFrequency(reading.frequency, tuning.strings)) : null;
  const displayCents = freeMode ? freeCents : cents;
  const progress = displayCents === null ? 50 : Math.max(5, Math.min(95, 50 + displayCents * 1.25));

  useEffect(() => {
    if (!active || status !== 'In tune' || tunedStrings.includes(stringIndex)) return undefined;
    const ping = new Audio('static/ping.mp3');
    ping.play().catch(() => {});
    setTunedStrings((current) => [...current, stringIndex]);
    if (stringIndex === tuning.strings.length - 1) {
      setFreeMode(true);
    }
  }, [active, status, stringIndex, tunedStrings, tuning.strings.length]);

  useEffect(() => {
    if (!active || freeMode || status !== 'In tune' || !tunedStrings.includes(stringIndex) || stringIndex === tuning.strings.length - 1) return undefined;
    const advance = setTimeout(() => {
      setStringIndex((current) => current + 1);
      setReading(null);
    }, 1200);
    return () => clearTimeout(advance);
  }, [active, freeMode, status, stringIndex, tunedStrings, tuning.strings.length]);

  const displayStatus = freeMode ? 'Free mode' : active ? status : 'Connect an input to tune';

  return (
    <div className="tuner-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="panel tuner-panel" role="dialog" aria-modal="true" aria-labelledby="tuner-title">
        <div className="tuner-header">
          <h2 id="tuner-title">Tuner</h2>
          <div className="row">
            <select value={tuningKey} onChange={(e) => setTuningKey(e.target.value)} aria-label="Tuning">
              {tuningKeys.map((key) => <option key={key} value={key}>{tunings[key].name}</option>)}
            </select>
            <button className="secondary" onClick={onClose} type="button">Close</button>
          </div>
        </div>
        <div className={`tuner-display ${displayStatusClass} ${freeMode ? 'free-mode' : ''}`}>
          <div className="tuner-note">{reading?.note ?? '--'}</div>
          {!freeMode && (
            <>
              <div className="tuner-target">Target <strong>{target.name}</strong></div>
              <div className="tuner-status">{displayStatus}</div>
            </>
          )}
          <div className="tuner-meter" aria-label={`${displayStatus}, ${displayCents ?? 0} cents`}>
            <span className="tuner-center" />
            <span className="tuner-needle" style={{ left: `${progress}%` }} />
          </div>
          <div className="tuner-cents">{displayCents === null ? '—' : `${displayCents > 0 ? '+' : ''}${displayCents} cents`}</div>
        </div>
        {!freeMode && (
          <>
            <div className="string-guide" aria-label="String order, high to low">
              {tuning.strings.map((string, index) => (
                <button
                  className={`string-chip ${index === stringIndex ? 'selected' : ''} ${tunedStrings.includes(index) ? 'tuned' : ''}`}
                  key={string.name}
                  onClick={() => { setStringIndex(index); setReading(null); }}
                  type="button"
                >
                  {string.name}
                </button>
              ))}
            </div>
            <p className="hint">Guided high-to-low tuning.</p>
          </>
        )}
      </div>
    </div>
  );
}
