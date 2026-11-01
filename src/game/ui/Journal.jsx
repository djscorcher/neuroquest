import { PLAYTIME_BY_DIFFICULTY } from '../../config/balance.js';

// Today's real tasks, read-only, with how much playtime each one earns.
export default function Journal({ tasks }) {
  return (
    <div className="nqw-journal">
      <p className="nqw-dim">Finish these in real life to earn more time here. Clear them all for a bonus.</p>
      {tasks.length === 0
        ? <p>No tasks left. Nice work.</p>
        : (
          <ul>
            {tasks.map(t => (
              <li key={t.id}>
                <span>{t.title}</span>
                <span className="nqw-badge">+{PLAYTIME_BY_DIFFICULTY[t.difficulty] ?? PLAYTIME_BY_DIFFICULTY.Easy}m</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
