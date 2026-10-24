import { useState } from 'react';
import City from './city/City.jsx';
import { useRunStream } from './state/useRunStream.js';
import { RunBar } from './ui/RunBar.jsx';
import { EventLog } from './ui/EventLog.jsx';
import { SideCard } from './ui/SideCard.jsx';

export default function App() {
  const { state, playback, start, control, startError } = useRunStream();
  const [selected, setSelected] = useState(null);

  return (
    <main className="app">
      <City state={state} playback={playback} selected={selected} onSelect={setSelected} />
      <header className="brand">
        <h1>Lookout</h1>
        <p>Scholarship Season · sample student: B.Tech CE, 2nd year, OBC, Maharashtra</p>
      </header>
      <RunBar state={state} playback={playback} start={start} control={control} startError={startError} />
      <EventLog state={state} onSelect={setSelected} />
      <SideCard selected={selected} state={state} onClose={() => setSelected(null)} />
      <p className="safety">Lookout never submits forms and never asks for, enters or stores passwords, OTPs or Aadhaar numbers.</p>
      <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan · click a building or character</p>
    </main>
  );
}
