import { Link } from 'react-router-dom';

export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <section className="card">
      <p className="eyebrow">Phase {phase}</p>
      <h1>{title}</h1>
      <p className="lede">Same screen exists on mobile. Logic will live in `@viora/core` so both platforms stay in sync.</p>
      <Link className="btn ghost" to="/">
        Back to welcome
      </Link>
    </section>
  );
}
