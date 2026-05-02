/**
 * App shell — top-level layout with tab navigation.
 */
import { useState } from 'preact/hooks';
import { SenderPage } from '@/app/routes/sender';
import { ReceiverPage } from '@/app/routes/receiver';

type Tab = 'sender' | 'receiver';

const styles: Record<string, Record<string, string | number>> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#0d1117',
    color: '#c9d1d9',
    minHeight: '100vh',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: '#58a6ff',
    letterSpacing: -0.5,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
  },
  tab: {
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    background: 'transparent',
    color: '#8b949e',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#1f2937',
    color: '#f0f6fc',
  },
  main: {
    flex: 1,
    padding: '24px',
    maxWidth: 960,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box' as const,
  },
};

export function App() {
  const [tab, setTab] = useState<Tab>('sender');

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.logo}>◈ QR-over-GIF</span>
        <nav style={styles.tabBar}>
          <button
            style={{ ...styles.tab, ...(tab === 'sender' ? styles.tabActive : {}) }}
            onClick={() => setTab('sender')}
          >
            📤 Sender
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'receiver' ? styles.tabActive : {}) }}
            onClick={() => setTab('receiver')}
          >
            📥 Receiver
          </button>
        </nav>
      </header>
      <main style={styles.main}>
        {tab === 'sender' ? <SenderPage /> : <ReceiverPage />}
      </main>
    </div>
  );
}
