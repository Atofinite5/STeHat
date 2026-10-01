import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Send, Lock, Wifi, WifiOff, Laptop, Check, Download, 
  FolderDown, Sparkles, Radio, MessageSquare, UserCheck
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { GatewayClient, PresencePeer } from './gatewayClient.js';
import { WebRTCManager, P2PMessage } from './webrtc.js';
import { localVault, StoredMessage } from './localVault.js';

export const App: React.FC = () => {
  // Machine Identity & Network
  const [deviceId, setDeviceId] = useState<string>('mac-' + Math.random().toString(36).substring(2, 6));
  const [displayName, setDisplayName] = useState<string>('My MacBook Pro');
  const [isGatewayConnected, setIsGatewayConnected] = useState<boolean>(false);
  const [gatewayUrl, setGatewayUrl] = useState<string>(() => {
    return localStorage.getItem('whispermesh_gateway_url') || 'ws://localhost:4000/v1/gateway';
  });

  // Unique Space Address (per machine)
  const [myOwnSpaceAddress, setMyOwnSpaceAddress] = useState<string>('');
  
  // AirDrop-style Radar Peers (100% Dynamic)
  const [radarPeers, setRadarPeers] = useState<PresencePeer[]>([]);
  const [pairedPeer, setPairedPeer] = useState<PresencePeer | null>(null);
  const [isRequestingPair, setIsRequestingPair] = useState<boolean>(false);
  const [incomingRequest, setIncomingRequest] = useState<any | null>(null);

  // Live P2P Chat State
  const [p2pState, setP2pState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [inputText, setInputText] = useState('');

  // References
  const gatewayRef = useRef<GatewayClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // 1. Initialize Machine Identity
  useEffect(() => {
    async function loadIdentity() {
      let uniqueId = '';
      try {
        const idKeys = await invoke<{ device_id: string; public_key_ed25519: string }>('get_or_create_device_identity');
        uniqueId = idKeys.device_id;
        setDeviceId(uniqueId);
      } catch (err) {
        uniqueId = 'mac-' + Math.random().toString(36).substring(2, 8);
        setDeviceId(uniqueId);
      }

      const cleanHash = uniqueId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
      const generatedSpace = `SPACE-${cleanHash}`;
      setMyOwnSpaceAddress(generatedSpace);
    }
    loadIdentity();
  }, []);

  // 2. Connect to Embedded Gateway & Global AirDrop Radar
  useEffect(() => {
    if (!myOwnSpaceAddress) return;

    const gw = new GatewayClient(gatewayUrl, deviceId, displayName);
    gatewayRef.current = gw;

    gw.onConnectionStateChange = (connected) => {
      setIsGatewayConnected(connected);
      if (connected) {
        gw.joinSpace(myOwnSpaceAddress, '000000');
      }
    };

    // Live AirDrop Peers: updates dynamically when laptops open/close
    gw.onPeersUpdated = (peers) => {
      const now = Date.now();
      const activePeers = peers.filter(p => (now - (p.lastSeenTimestamp || now)) < 20000);
      setRadarPeers(activePeers);
    };

    // Incoming AirDrop Request Modal
    gw.onIncomingRequest = (req) => {
      setIncomingRequest(req);
    };

    // When connection is accepted, establish WebRTC
    gw.onSignalingAuthorized = async (auth) => {
      setIsRequestingPair(false);
      if (webrtcRef.current) {
        webrtcRef.current.initConnection(auth.iceServers || [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ]);
        try {
          const offer = await webrtcRef.current.createOffer(auth.sessionId);
          gw.sendSignal('SIGNAL_OFFER', { sessionId: auth.sessionId, offer, senderDeviceId: deviceId });
        } catch (e) {
          console.error('Error creating offer:', e);
        }
      }
    };

    gw.onPairingRejected = () => {
      setIsRequestingPair(false);
      setPairedPeer(null);
      alert('Pairing request was declined.');
    };

    gw.onSignalReceived = async (type, payload) => {
      if (!webrtcRef.current) return;

      if (type === 'SIGNAL_OFFER' && payload.offer) {
        webrtcRef.current.initConnection([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ]);
        const answer = await webrtcRef.current.handleOfferAndCreateAnswer(payload.offer);
        gw.sendSignal('SIGNAL_ANSWER', { sessionId: payload.sessionId, answer, senderDeviceId: deviceId });
      } else if (type === 'SIGNAL_ANSWER' && payload.answer) {
        await webrtcRef.current.handleAnswer(payload.answer);
      } else if (type === 'SIGNAL_ICE' && payload.candidate) {
        await webrtcRef.current.addIceCandidate(payload.candidate);
      }
    };

    // WebRTC Manager
    const rtc = new WebRTCManager(
      (type, payload) => gw.sendSignal(type, payload),
      async (p2pMsg: P2PMessage) => {
        const stored: StoredMessage = {
          id: p2pMsg.id,
          spaceAddress: myOwnSpaceAddress,
          senderDeviceId: p2pMsg.senderDeviceId,
          senderName: p2pMsg.senderName,
          text: p2pMsg.text,
          timestamp: p2pMsg.timestamp,
          deliveryStatus: 'received'
        };
        await localVault.saveMessage(stored);
        setMessages((prev) => [...prev, stored]);
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
  }, [myOwnSpaceAddress, gatewayUrl]);

  // Auto-scroll chat
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click Pair button on any visible laptop
  const handlePairWithPeer = (peer: PresencePeer) => {
    setPairedPeer(peer);
    setIsRequestingPair(true);
    gatewayRef.current?.requestPairing(peer.deviceId);
  };

  // Accept incoming request
  const handleAcceptPairing = () => {
    if (!incomingRequest) return;
    const initiator: PresencePeer = {
      deviceId: incomingRequest.initiatorDevice.deviceId,
      displayName: incomingRequest.initiatorDevice.displayName,
      platform: incomingRequest.initiatorDevice.platform,
      status: 'AVAILABLE',
      lastSeenTimestamp: Date.now()
    };
    setPairedPeer(initiator);
    gatewayRef.current?.acceptPairing(incomingRequest.sessionId, initiator.deviceId);
    setIncomingRequest(null);
  };

  // Decline incoming request
  const handleDeclinePairing = () => {
    if (!incomingRequest) return;
    gatewayRef.current?.rejectPairing(incomingRequest.sessionId);
    setIncomingRequest(null);
  };

  // Send Direct Message
  const sendP2PMessage = async () => {
    if (!inputText.trim()) return;
    const msgId = `p2p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const p2pMsg: P2PMessage = {
      id: msgId,
      senderDeviceId: deviceId,
      senderName: displayName,
      text: inputText.trim(),
      timestamp: Date.now()
    };

    const stored: StoredMessage = {
      ...p2pMsg,
      spaceAddress: myOwnSpaceAddress,
      deliveryStatus: 'sent'
    };

    await localVault.saveMessage(stored);
    setMessages((prev) => [...prev, stored]);
    setInputText('');

    webrtcRef.current?.sendMessage(p2pMsg);
  };

  // Export Transcript
  const handleDownloadTranscript = async () => {
    const markdown = await localVault.exportChat(myOwnSpaceAddress, 'markdown');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WhisperMesh-Chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'rgba(9, 14, 26, 0.92)',
      backdropFilter: 'blur(40px)',
      WebkitBackdropFilter: 'blur(40px)',
      color: '#f3f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", -system-ui, sans-serif',
      userSelect: 'none',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Native macOS Overlay Header */}
      <header data-tauri-drag-region style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px 14px 80px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 78, 59, 0.5))',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Shield style={{ color: '#10b981', width: 18, height: 18 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.5px' }}>WhisperMesh</span>
              <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                AIRDROP MESH
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Zero Configuration • Direct Laptop-to-Laptop Connection</div>
          </div>
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <span>{isGatewayConnected ? 'Mesh Active' : 'Connecting...'}</span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 12
          }}>
            <Laptop style={{ width: 14, height: 14, color: '#9ca3af' }} />
            <span style={{ color: '#d1d5db', fontWeight: 600 }}>{displayName}</span>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* AIRDROP INCOMING PAIRING CARD (DROPS DOWN FROM TOP)                       */}
      {/* ========================================================================= */}
      {incomingRequest && (
        <div style={{
          position: 'absolute',
          top: 65,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 400,
          background: 'rgba(23, 32, 54, 0.97)',
          backdropFilter: 'blur(30px)',
          border: '1.5px solid #10b981',
          borderRadius: 16,
          padding: '18px 24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(16, 185, 129, 0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          minWidth: 480
        }}>
          <div style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(16, 185, 129, 0.5)'
          }}>
            <Laptop style={{ width: 26, height: 26, color: '#34d399' }} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
              Pairing Request from {incomingRequest.initiatorDevice.displayName}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>
              Connect directly laptop-to-laptop over encrypted WebRTC?
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleDeclinePairing}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e5e7eb',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Decline
            </button>
            <button
              onClick={handleAcceptPairing}
              style={{
                padding: '9px 20px',
                borderRadius: 8,
                background: '#059669',
                border: 'none',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.45)'
              }}
            >
              Accept & Connect
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Sidebar: Live AirDrop Radar */}
        <aside style={{
          width: 320,
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(11, 17, 32, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 20
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* AirDrop Radar Section Title */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Radio style={{ width: 16, height: 16, color: '#34d399' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#e5e7eb' }}>
                    AirDrop Devices
                  </span>
                </div>
                <span style={{
                  fontSize: 11,
                  background: radarPeers.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  color: radarPeers.length > 0 ? '#34d399' : '#9ca3af',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 700
                }}>
                  {radarPeers.length} ONLINE
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                Active laptops discoverable over the network.
              </div>
            </div>

            {/* Dynamic Live Laptop Bubbles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {radarPeers.length === 0 ? (
                <div style={{
                  padding: '30px 16px',
                  borderRadius: 14,
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px dashed rgba(255, 255, 255, 0.08)',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  <Laptop style={{ width: 36, height: 36, margin: '0 auto 10px auto', color: '#4b5563' }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>Looking for devices...</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.4 }}>
                    When your friend opens WhisperMesh, their laptop will appear here automatically.
                  </div>
                </div>
              ) : (
                radarPeers.map((peer) => {
                  const isCurrentlyPaired = pairedPeer?.deviceId === peer.deviceId;
                  return (
                    <div
                      key={peer.deviceId}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        background: isCurrentlyPaired ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        border: isCurrentlyPaired ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          position: 'relative',
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
                          border: '1px solid rgba(255,255,255,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Laptop style={{ width: 20, height: 20, color: '#93c5fd' }} />
                          <span style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: '#10b981',
                            border: '2px solid #0b1120',
                            boxShadow: '0 0 8px #10b981'
                          }}></span>
                        </div>

                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#ffffff' }}>{peer.displayName}</div>
                          <div style={{ fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>● Live Now</span>
                          </div>
                        </div>
                      </div>

                      {isCurrentlyPaired ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.2)',
                          padding: '6px 12px',
                          borderRadius: 8
                        }}>
                          <Check style={{ width: 14, height: 14 }} /> Connected
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePairWithPeer(peer)}
                          disabled={isRequestingPair}
                          style={{
                            padding: '7px 16px',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #059669, #047857)',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                          }}
                        >
                          <Sparkles style={{ width: 12, height: 12 }} />
                          <span>{isRequestingPair && pairedPeer?.deviceId === peer.deviceId ? 'Connecting...' : 'Pair'}</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Sidebar: Vault Download */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
            <button
              onClick={handleDownloadTranscript}
              title="Download entire chat history to your laptop (Markdown)"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '11px 14px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e5e7eb',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <FolderDown style={{ width: 15, height: 15, color: '#34d399' }} />
              <span>Download Chat Transcript</span>
            </button>
          </div>
        </aside>

        {/* Center: Live P2P Chat Stream */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Header Bar */}
          <div style={{
            padding: '14px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: p2pState === 'connected' ? '#10b981' : '#f59e0b',
                boxShadow: p2pState === 'connected' ? '0 0 10px #10b981' : '0 0 10px #f59e0b'
              }}></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {pairedPeer ? `Chatting with ${pairedPeer.displayName}` : 'AirDrop P2P Chat'}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  WebRTC Tunnel: <b style={{ color: p2pState === 'connected' ? '#34d399' : '#fbbf24' }}>{p2pState.toUpperCase()}</b> • 100% Local Storage
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadTranscript}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: 12,
                textDecoration: 'underline'
              }}
            >
              <Download style={{ width: 13, height: 13 }} /> Export Transcript
            </button>
          </div>

          {/* Messages View */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280' }}>
                <Lock style={{ width: 44, height: 44, margin: '0 auto 12px auto', color: '#374151' }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                  {pairedPeer ? 'Connected! Send your first message below.' : 'AirDrop Discovery Active'}
                </div>
                <div style={{ fontSize: 13, maxWidth: 440, margin: '0 auto', lineHeight: 1.5 }}>
                  {pairedPeer 
                    ? 'Your connection is end-to-end encrypted directly laptop-to-laptop.'
                    : 'Click "Pair" on your friend’s laptop card in the left sidebar to connect directly.'}
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
            background: 'rgba(11, 17, 32, 0.75)',
            display: 'flex',
            gap: 12
          }}>
            <input
              type="text"
              placeholder={p2pState === 'connected' ? 'Type message over direct WebRTC...' : 'Pair with an active laptop to send direct message...'}
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
    </div>
  );
};
