import City from './city/City.jsx';

export default function App() {
  return (
    <main className="app">
      <City />
      <header className="brand">
        <h1>Lookout</h1>
        <p>Scholarship Season · city preview</p>
      </header>
      <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan · hover a landmark</p>
    </main>
  );
}
