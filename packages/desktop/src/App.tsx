import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Settings, Send, Lock, Wifi, WifiOff, Laptop, Key, RefreshCw, X, Radio, ArrowRight
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { GatewayClient, PresencePeer } from './gatewayClient.js';
import { WebRTCManager, P2PMessage } from './webrtc.js';

export const App: React.FC = () => {
  // Machine Identity & Network
  const [deviceId, setDeviceId] = useState<string>('local-mac-' + Math.random().toString(36).substring(2, 6));
  const [displayName, setDisplayName] = useState<string>('Bhargav (MacBook)');
  const [lanIp, setLanIp] = useState<string>('127.0.0.1');
  const [gatewayUrl, setGatewayUrl] = useState<string>(() => {
    return localStorage.getItem('whispermesh_gateway_url') || 'ws://localhost:4000/v1/gateway';
  });
  const [isGatewayConnected, setIsGatewayConnected] = useState<boolean>(false);

  // Settings & Pairing Drawer State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [friendGatewayInput, setFriendGatewayInput] = useState<string>('');
  const [manualOtpInput, setManualOtpInput] = useState<string>('');

  // Discovered Peers & Active Peer
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [activePeer, setActivePeer] = useState<PresencePeer | null>(null);

  // Pairing Flow & OTP
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<any | null>(null);

  // Chat State (Direct WebRTC DataChannel)
  const [p2pState, setP2pState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [inputText, setInputText] = useState('');

  // References
  const gatewayRef = useRef<GatewayClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Keyboard Shortcut: Command + K / Ctrl + K toggles Settings & Pairing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 1. Initialize Machine Identity & Network IP from Tauri Core
  useEffect(() => {
    async function loadIdentity() {
      try {
        const idKeys = await invoke<{ device_id: string; public_key_ed25519: string }>('get_or_create_device_identity');
        setDeviceId(idKeys.device_id);
      } catch (err) {
        console.warn('Tauri IPC fallback:', err);
      }

      try {
        const ip = await invoke<string>('get_lan_ip');
        if (ip) setLanIp(ip);
      } catch (err) {
        console.warn('LAN IP fetch fallback:', err);
      }
    }
    loadIdentity();
  }, []);

  // 2. Connect to Live Dynamic Signaling Gateway
  useEffect(() => {
    const gw = new GatewayClient(gatewayUrl, deviceId, displayName);
    gatewayRef.current = gw;

    gw.onConnectionStateChange = (connected) => {
      setIsGatewayConnected(connected);
    };

    gw.onPeersUpdated = (updatedPeers) => {
      setPeers(updatedPeers);
    };

    gw.onIncomingRequest = (req) => {
      setIncomingRequest(req);
    };

    gw.onPairingChallenge = (challenge) => {
      setCurrentSessionId(challenge.sessionId);
      setPairingCode(challenge.pairingCode);
    };

    gw.onSignalingAuthorized = async (auth) => {
      if (webrtcRef.current) {
        webrtcRef.current.initConnection(auth.iceServers);
        try {
          const offer = await webrtcRef.current.createOffer(auth.sessionId);
          gw.sendSignal('SIGNAL_OFFER', { sessionId: auth.sessionId, offer });
        } catch (e) {
          console.error('Error creating offer:', e);
        }
      }
    };

    gw.onSignalReceived = async (type, payload) => {
      if (!webrtcRef.current) return;

      if (type === 'SIGNAL_OFFER') {
        const answer = await webrtcRef.current.handleOfferAndCreateAnswer(payload.offer);
        gw.sendSignal('SIGNAL_ANSWER', { sessionId: payload.sessionId, answer });
      } else if (type === 'SIGNAL_ANSWER') {
        await webrtcRef.current.handleAnswer(payload.answer);
      } else if (type === 'SIGNAL_ICE') {
        if (payload.candidate) {
          await webrtcRef.current.addIceCandidate(payload.candidate);
        }
      }
    };

    // Initialize WebRTC
    const rtc = new WebRTCManager(
      (type, payload) => gw.sendSignal(type, payload),
      (msg) => {
        setMessages((prev) => [...prev, msg]);
      },
      (state) => {
        setP2pState(state);
      }
    );
    webrtcRef.current = rtc;

    gw.connect();

    return () => {
      gw.disconnect();
      rtc.close();
    };
  }, [deviceId, gatewayUrl]);

  // Auto-scroll chat window
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initiate Pairing with Selected Peer
  const initiatePairing = (peer: PresencePeer) => {
    setActivePeer(peer);
    const sessId = gatewayRef.current?.requestPairing(peer.deviceId);
    if (sessId) setCurrentSessionId(sessId);
  };

  // Accept Incoming Pairing Request
  const acceptIncomingPairing = () => {
    if (!incomingRequest) return;
    setActivePeer({
      deviceId: incomingRequest.initiatorDevice.deviceId,
      displayName: incomingRequest.initiatorDevice.displayName,
      platform: incomingRequest.initiatorDevice.platform,
      status: 'CONNECTING',
      lastSeenTimestamp: Date.now()
    });
    gatewayRef.current?.acceptPairing(incomingRequest.sessionId, incomingRequest.initiatorDevice.deviceId);
    setIncomingRequest(null);
  };

  // Confirm Matching OTP
  const confirmOtp = () => {
    if (!currentSessionId) return;
    gatewayRef.current?.confirmPairingCode(currentSessionId);
  };

  // Connect to Friend's IP from Settings Drawer
  const connectToFriendIp = () => {
    if (!friendGatewayInput.trim()) return;
    let url = friendGatewayInput.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = `ws://${url}:4000/v1/gateway`;
    }
    localStorage.setItem('whispermesh_gateway_url', url);
    setGatewayUrl(url);
    setIsSettingsOpen(false);
  };

  // Send Direct P2P Message
  const sendP2PMessage = () => {
    if (!inputText.trim()) return;
    const msg: P2PMessage = {
      id: `p2p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderDeviceId: deviceId,
      senderName: displayName,
      text: inputText.trim(),
      timestamp: Date.now()
    };

    const sent = webrtcRef.current?.sendMessage(msg);
    if (sent) {
      setMessages((prev) => [...prev, msg]);
      setInputText('');
    } else {
      alert('P2P Direct DataChannel is not open yet. Open Settings (bottom left or Cmd+K) to pair with your friend.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'rgba(8, 12, 22, 0.85)',
      backdropFilter: 'blur(36px)',
      WebkitBackdropFilter: 'blur(36px)',
      color: '#f3f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
      userSelect: 'none',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Stealth Glass Top Titlebar */}
      <header data-tauri-drag-region style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px 14px 80px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 78, 59, 0.4))',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Shield style={{ color: '#10b981', width: 18, height: 18 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase' }}>WhisperMesh</span>
              <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                STEALTH P2P
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Zero Server Logs • Direct Laptop WebRTC</div>
          </div>
        </div>

        {/* Global Connection Badge & Machine Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 20,
            background: isGatewayConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${isGatewayConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: isGatewayConnected ? '#34d399' : '#f87171'
          }}>
            {isGatewayConnected ? <Wifi style={{ width: 14, height: 14 }} /> : <WifiOff style={{ width: 14, height: 14 }} />}
            <span>{isGatewayConnected ? 'Mesh Online' : 'Offline'}</span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '4px 12px',
            borderRadius: 8,
            fontSize: 12
          }}>
            <Laptop style={{ width: 14, height: 14, color: '#9ca3af' }} />
            <span style={{ color: '#d1d5db' }}>{displayName}</span>
          </div>
        </div>
      </header>

      {/* Incoming Request Notification Modal */}
      {incomingRequest && (
        <div style={{
          position: 'absolute',
          top: 70,
          right: 24,
          zIndex: 100,
          background: 'rgba(17, 24, 39, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid #10b981',
          borderRadius: 12,
          padding: 18,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(16, 185, 129, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 320
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key style={{ width: 22, height: 22, color: '#10b981' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Incoming Pairing Request</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>From: <b>{incomingRequest.initiatorDevice.displayName}</b></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={acceptIncomingPairing}
              style={{ flex: 1, padding: '8px 12px', background: '#059669', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Accept & Show OTP
            </button>
            <button
              onClick={() => setIncomingRequest(null)}
              style={{ padding: '8px 12px', background: '#374151', border: 'none', borderRadius: 6, color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Side Bar: Conversation Info & Bottom Settings Toggle */}
        <aside style={{
          width: 260,
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(10, 15, 28, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 16
        }}>
          {/* Top Section: Active Peer Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              P2P Direct Tunnel
            </div>

            <div style={{
              padding: 14,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: p2pState === 'connected' ? '#10b981' : '#f59e0b',
                  boxShadow: p2pState === 'connected' ? '0 0 10px #10b981' : '0 0 10px #f59e0b'
                }}></span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {activePeer ? activePeer.displayName : 'No Peer Selected'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                Status: <b style={{ color: p2pState === 'connected' ? '#34d399' : '#fbbf24' }}>{p2pState.toUpperCase()}</b>
              </div>
              {activePeer && (
                <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activePeer.deviceId}
                </div>
              )}
            </div>

            {/* Quick Peers list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: 8 }}>
                Discovered Laptops ({peers.length})
              </div>
              {peers.length === 0 ? (
                <div style={{ fontSize: 12, color: '#6b7280', padding: '6px 0' }}>
                  No peers on this Wi-Fi yet. Open Settings to connect.
                </div>
              ) : (
                peers.map((peer) => (
                  <button
                    key={peer.deviceId}
                    onClick={() => initiatePairing(peer)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: activePeer?.deviceId === peer.deviceId ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: activePeer?.deviceId === peer.deviceId ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{peer.displayName}</div>
                    <Key style={{ width: 12, height: 12, color: '#10b981' }} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Bottom Left Settings Button (Trigger) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
            <button
              onClick={() => setIsSettingsOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 8,
                background: isSettingsOpen ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSettingsOpen ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Settings style={{ width: 16, height: 16, color: '#60a5fa' }} />
                <span>Pairing & Settings</span>
              </div>
              <span style={{ fontSize: 11, background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: 4, color: '#9ca3af' }}>⌘K</span>
            </button>
          </div>
        </aside>

        {/* Center / Right: Direct P2P Chat Panel */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Active OTP Pairing Banner if Active */}
          {pairingCode && (
            <div style={{
              padding: '12px 24px',
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Key style={{ width: 18, height: 18, color: '#10b981' }} />
                <span style={{ fontSize: 13, color: '#a7f3d0' }}>Mutual Pairing OTP:</span>
                <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '3px', color: '#10b981' }}>
                  {pairingCode}
                </span>
              </div>
              <button
                onClick={confirmOtp}
                style={{
                  background: '#059669',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Confirm Match
              </button>
            </div>
          )}

          {/* Chat Messages View */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280' }}>
                <Lock style={{ width: 44, height: 44, margin: '0 auto 12px auto', color: '#374151' }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>Direct P2P Encrypted Chat</div>
                <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
                  Click <b>Pairing & Settings (⌘K)</b> at the bottom left to pair with your friend's laptop or open a local peer.
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.senderDeviceId === deviceId;
                return (
                  <div key={m.id} style={{
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '65%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, padding: '0 4px' }}>
                      {isMe ? 'You' : m.senderName} • {new Date(m.timestamp).toLocaleTimeString()}
                    </div>
                    <div style={{
                      padding: '12px 18px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMe ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'rgba(255, 255, 255, 0.06)',
                      backdropFilter: 'blur(16px)',
                      border: isMe ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      fontSize: 14,
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                      boxShadow: isMe ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none'
                    }}>
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatScrollRef} />
          </div>

          {/* Chat Input Bar */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(10, 15, 28, 0.65)',
            display: 'flex',
            gap: 12
          }}>
            <input
              type="text"
              placeholder={p2pState === 'connected' ? 'Type stealth message to peer...' : 'Pair with a peer laptop (Cmd+K) to start chat...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendP2PMessage()}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                padding: '12px 16px',
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
            />
            <button
              onClick={sendP2PMessage}
              style={{
                background: '#10b981',
                border: 'none',
                color: '#fff',
                padding: '12px 22px',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Send style={{ width: 16, height: 16 }} /> Send
            </button>
          </div>
        </main>
      </div>

      {/* Left/Bottom Settings Drawer (Slide-Over Glass Modal) */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 200,
          display: 'flex'
        }}>
          <div style={{
            width: 380,
            height: '100%',
            background: 'rgba(13, 20, 36, 0.95)',
            backdropFilter: 'blur(32px)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '10px 0 30px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Settings style={{ width: 20, height: 20, color: '#60a5fa' }} />
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Pairing & Settings</span>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  <X style={{ width: 20, height: 20 }} />
                </button>
              </div>

              {/* Your Shareable Endpoint */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>Your Wi-Fi Endpoint:</span>
                <div style={{
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#60a5fa'
                }}>
                  ws://{lanIp}:4000/v1/gateway
                </div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Share this with your friend so they can connect directly.</span>
              </div>

              {/* Connect to Friend's Laptop */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>Connect to Friend's IP / Port:</span>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.50 or ws://192.168.1.50:4000"
                  value={friendGatewayInput}
                  onChange={(e) => setFriendGatewayInput(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
                <button
                  onClick={connectToFriendIp}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#2563eb',
                    border: 'none',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  <span>Connect to Friend</span>
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* Manual OTP Confirmation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>Manual OTP Pairing Code:</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={manualOtpInput}
                    onChange={(e) => setManualOtpInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#10b981',
                      fontFamily: 'monospace',
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: '2px',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => {
                      if (currentSessionId) {
                        confirmOtp();
                        setIsSettingsOpen(false);
                      } else {
                        alert('Select an available peer from the list to initiate pairing first.');
                      }
                    }}
                    style={{
                      background: '#059669',
                      border: 'none',
                      color: '#fff',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    Pair OTP
                  </button>
                </div>
              </div>

              {/* Change Display Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>Your Stealth Name:</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    gatewayRef.current?.updateDisplayName(e.target.value);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
              Press <b>ESC</b> or <b>⌘K</b> to close settings
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
