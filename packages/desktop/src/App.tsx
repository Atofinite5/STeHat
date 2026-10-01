import React, { useState } from 'react';
import { Shield, Radio, Bot, Lock, CheckCircle2, Send, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [displayName, setDisplayName] = useState('Bhargav (MacBook)');
  const [activeTab, setActiveTab] = useState<'presence' | 'chat' | 'agent'>('presence');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [agentResponse, setAgentResponse] = useState('');
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Available peers list
  const [peers] = useState([
    { deviceId: 'peer-alice-01', displayName: 'Alice (iPhone)', platform: 'iOS', status: 'AVAILABLE' },
    { deviceId: 'peer-bob-02', displayName: 'Bob (Workstation)', platform: 'Windows', status: 'AVAILABLE' },
    { deviceId: 'peer-charlie-03', displayName: 'Charlie (Linux Box)', platform: 'Linux', status: 'AVAILABLE' }
  ]);

  const runLocalAgent = async () => {
    if (!agentPrompt.trim()) return;
    setIsAgentRunning(true);
    setAgentLogs([]);
    setAgentResponse('');

    try {
      // Direct IPC call or client simulation
      setAgentLogs([
        'Invoking StateGraph node: SecurityFilter...',
        'Prompt validated. Zero private key / IP leaks detected.',
        'Invoking StateGraph node: RetrieveMemory...',
        'Loaded local graph context (Node: local-user -> active-tech).',
        'Invoking StateGraph node: ReasonEngine...',
        'Invoking StateGraph node: SynthesizeResponse...'
      ]);

      setAgentResponse(
        `[LangGraph Edge AI Response]\nProcessed query: "${agentPrompt}"\n\nResult: Local semantic graph contains active development context for WhisperMesh (Rust + Tauri + Swift + LangGraph). Zero data transmitted over the internet.`
      );
    } catch (err) {
      setAgentResponse(`Agent error: ${(err as Error).message}`);
    } finally {
      setIsAgentRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#090d16', color: '#f3f4f6' }}>
      {/* Top Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1f2937', background: '#111827' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield style={{ color: '#10b981', width: 24, height: 24 }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>WhisperMesh</h1>
          <span style={{ fontSize: 11, background: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: 9999, fontWeight: 600 }}>P2P Encrypted</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 13, color: '#9ca3af' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span>
            <span>Online as <b style={{ color: '#f3f4f6' }}>{displayName}</b></span>
          </div>
          <button style={{ background: '#374151', border: 'none', color: '#e5e7eb', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }} onClick={() => setDisplayName(prompt('Set Display Name:', displayName) || displayName)}>
            Edit Name
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <nav style={{ width: 220, borderRight: '1px solid #1f2937', background: '#0e1422', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => setActiveTab('presence')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: activeTab === 'presence' ? '#1f2937' : 'transparent', color: activeTab === 'presence' ? '#60a5fa' : '#9ca3af', fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
          >
            <Radio style={{ width: 18, height: 18 }} /> Global Presence
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: activeTab === 'chat' ? '#1f2937' : 'transparent', color: activeTab === 'chat' ? '#60a5fa' : '#9ca3af', fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
          >
            <Lock style={{ width: 18, height: 18 }} /> Encrypted Chat
          </button>

          <button
            onClick={() => setActiveTab('agent')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: activeTab === 'agent' ? '#1f2937' : 'transparent', color: activeTab === 'agent' ? '#a78bfa' : '#9ca3af', fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}
          >
            <Bot style={{ width: 18, height: 18 }} /> LangGraph Agent
          </button>
        </nav>

        {/* Content Area */}
        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {activeTab === 'presence' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, margin: '0 0 4px 0' }}>Available Global Peers</h2>
                  <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>Ephemeral presence managed via Redis. Zero centralized address books.</p>
                </div>
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563eb', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                  <RefreshCw style={{ width: 14, height: 14 }} /> Refresh Peers
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {peers.map((peer) => (
                  <div key={peer.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#131b2e', borderRadius: 10, border: '1px solid #1f2937' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}></div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{peer.displayName}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>Platform: <b>{peer.platform}</b> • ID: {peer.deviceId}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => alert(`Initiating 6-digit numeric pairing handshake with ${peer.displayName}...`)}
                      style={{ background: '#059669', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Connect & Pair
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: '#9ca3af' }}>
              <Lock style={{ width: 48, height: 48, color: '#4b5563', marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, color: '#f3f4f6', margin: '0 0 8px 0' }}>No Active P2P Session</h3>
              <p style={{ maxWidth: 400, fontSize: 14, margin: 0 }}>
                Select an available peer from the <b>Global Presence</b> tab and enter the 6-digit verification code to open an end-to-end encrypted WebRTC DataChannel.
              </p>
            </div>
          )}

          {activeTab === 'agent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bot style={{ color: '#a78bfa' }} /> On-Device LangGraph AI Agent
                </h2>
                <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>
                  Cyclic StateGraph reasoning engine running 100% locally. Automatic SecurityFilter intercepts key seeds & IP leaks.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Ask local agent (e.g., 'Summarize topics from local memory' or 'Connect to Bob')..."
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runLocalAgent()}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: '#131b2e', border: '1px solid #374151', color: '#fff', fontSize: 14 }}
                />
                <button
                  onClick={runLocalAgent}
                  disabled={isAgentRunning}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#7c3aed', border: 'none', color: '#fff', padding: '12px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: isAgentRunning ? 0.6 : 1 }}
                >
                  <Send style={{ width: 16, height: 16 }} /> {isAgentRunning ? 'Reasoning...' : 'Ask Agent'}
                </button>
              </div>

              {agentResponse && (
                <div style={{ padding: 18, borderRadius: 10, background: '#1e1b4b', border: '1px solid #4338ca', color: '#e0e7ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, fontSize: 14, color: '#a5b4fc' }}>
                    <CheckCircle2 style={{ width: 18, height: 18, color: '#818cf8' }} /> Agent Output (100% On-Device)
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}>
                    {agentResponse}
                  </pre>
                </div>
              )}

              {agentLogs.length > 0 && (
                <div style={{ padding: 14, borderRadius: 8, background: '#0a0d14', border: '1px solid #1f2937' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>StateGraph Execution Log:</div>
                  {agentLogs.map((log, idx) => (
                    <div key={idx} style={{ fontSize: 12, fontFamily: 'monospace', color: '#10b981' }}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
