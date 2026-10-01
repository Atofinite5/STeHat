import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Settings, Send, Lock, Wifi, WifiOff, Laptop, Key, RefreshCw, X, Radio, ArrowRight,
  Download, Plus, Minus, MoreHorizontal, HelpCircle, Check, Copy, Globe, FolderDown
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { GatewayClient, PresencePeer } from './gatewayClient.js';
import { WebRTCManager, P2PMessage } from './webrtc.js';
import { localVault, StoredMessage, FavoriteSpace } from './localVault.js';

export const App: React.FC = () => {
  // Machine Identity & Network
  const [deviceId, setDeviceId] = useState<string>('mac-' + Math.random().toString(36).substring(2, 6));
  const [displayName, setDisplayName] = useState<string>('My MacBook Pro');
  const [lanIp, setLanIp] = useState<string>('127.0.0.1');
  const [isGatewayConnected, setIsGatewayConnected] = useState<boolean>(false);
  const [gatewayUrl, setGatewayUrl] = useState<string>(() => {
    return localStorage.getItem('whispermesh_gateway_url') || 'ws://localhost:4000/v1/gateway';
  });

  // Unique Space Address (Each application has its own unique space address)
  const [myOwnSpaceAddress, setMyOwnSpaceAddress] = useState<string>('');
  const [activeSpaceAddress, setActiveSpaceAddress] = useState<string>('');
  
  // macOS "Connect to Space" Window (Command + K)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [spaceAddressInput, setSpaceAddressInput] = useState<string>('');
  const [spaceOtpInput, setSpaceOtpInput] = useState<string>('');
  const [favoriteSpaces, setFavoriteSpaces] = useState<FavoriteSpace[]>([]);
  const [selectedFavorite, setSelectedFavorite] = useState<string | null>(null);

  // Live P2P Chat State
  const [p2pState, setP2pState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);

  // References
  const gatewayRef = useRef<GatewayClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // 1. Initialize Machine Identity & Unique Space Address
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

      // Generate deterministic unique space code for this machine (e.g. SPACE-8F4A)
      const cleanHash = uniqueId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
      const generatedSpace = `SPACE-${cleanHash}`;
      setMyOwnSpaceAddress(generatedSpace);
      setActiveSpaceAddress(generatedSpace);
      setSpaceAddressInput(generatedSpace);

      // Load LAN IP
      try {
        const ip = await invoke<string>('get_lan_ip');
        if (ip) setLanIp(ip);
      } catch (err) {
        console.warn('LAN IP fetch:', err);
      }

      // Load Favorites from Local Vault
      try {
        const favs = await localVault.getFavoriteSpaces();
        setFavoriteSpaces(favs);
      } catch (e) {
        console.warn('Load favorites error:', e);
      }
    }
    loadIdentity();
  }, []);

  // 2. Global Keyboard Shortcut: Command + K / Ctrl + K toggles macOS Connect to Space Dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsConnectModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 3. Connect to Space Broker Gateway
  useEffect(() => {
    if (!myOwnSpaceAddress) return;

    const gw = new GatewayClient(gatewayUrl, deviceId, displayName);
    gatewayRef.current = gw;

    gw.onConnectionStateChange = (connected) => {
      setIsGatewayConnected(connected);
      if (connected && activeSpaceAddress) {
        gw.joinSpace(activeSpaceAddress, spaceOtpInput || '000000');
      }
    };

    gw.onSpaceJoined = (info) => {
      console.log('[Space] Successfully joined space:', info);
    };

    gw.onPeerJoinedSpace = async (peerInfo) => {
      console.log('[Space] Peer entered space:', peerInfo);
      // Auto initiate WebRTC offer to peer in this space
      if (webrtcRef.current) {
        webrtcRef.current.initConnection([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' }
        ]);
        try {
          const offer = await webrtcRef.current.createOffer(activeSpaceAddress);
          gw.sendSpaceSignal(activeSpaceAddress, 'SIGNAL_OFFER', { offer, senderDeviceId: deviceId });
        } catch (e) {
          console.error('Error creating space offer:', e);
        }
      }
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
        gw.sendSpaceSignal(activeSpaceAddress, 'SIGNAL_ANSWER', { answer, senderDeviceId: deviceId });
      } else if (type === 'SIGNAL_ANSWER' && payload.answer) {
        await webrtcRef.current.handleAnswer(payload.answer);
      } else if (type === 'SIGNAL_ICE' && payload.candidate) {
        await webrtcRef.current.addIceCandidate(payload.candidate);
      }
    };

    // Initialize WebRTC Manager
    const rtc = new WebRTCManager(
      (type, payload) => gw.sendSpaceSignal(activeSpaceAddress, type, payload),
      async (p2pMsg: P2PMessage) => {
        const stored: StoredMessage = {
          id: p2pMsg.id,
          spaceAddress: activeSpaceAddress,
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
  }, [myOwnSpaceAddress, activeSpaceAddress, gatewayUrl]);

  // Load local chat history for the active space
  useEffect(() => {
    if (!activeSpaceAddress) return;
    localVault.getMessagesForSpace(activeSpaceAddress).then((stored) => {
      setMessages(stored);
    });
  }, [activeSpaceAddress]);

  // Auto-scroll chat
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Connect to Remote Space (Action from ⌘K window)
  const handleConnectToSpace = async () => {
    if (!spaceAddressInput.trim()) return;
    const targetSpace = spaceAddressInput.trim().toUpperCase();
    setActiveSpaceAddress(targetSpace);

    // Save to favorites
    const fav: FavoriteSpace = {
      spaceAddress: targetSpace,
      alias: targetSpace,
      lastConnected: Date.now()
    };
    await localVault.addFavoriteSpace(fav);
    const updatedFavs = await localVault.getFavoriteSpaces();
    setFavoriteSpaces(updatedFavs);

    // Join space on gateway
    gatewayRef.current?.joinSpace(targetSpace, spaceOtpInput.trim() || '000000');
    setIsConnectModalOpen(false);
  };

  // Add Favorite
  const handleAddFavorite = async () => {
    if (!spaceAddressInput.trim()) return;
    const targetSpace = spaceAddressInput.trim().toUpperCase();
    const fav: FavoriteSpace = {
      spaceAddress: targetSpace,
      alias: targetSpace,
      lastConnected: Date.now()
    };
    await localVault.addFavoriteSpace(fav);
    const favs = await localVault.getFavoriteSpaces();
    setFavoriteSpaces(favs);
  };

  // Remove Favorite
  const handleRemoveFavorite = async () => {
    if (!selectedFavorite) return;
    await localVault.removeFavoriteSpace(selectedFavorite);
    const favs = await localVault.getFavoriteSpaces();
    setFavoriteSpaces(favs);
    setSelectedFavorite(null);
  };

  // Send Direct P2P Message
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
      spaceAddress: activeSpaceAddress,
      deliveryStatus: 'sent'
    };

    // Save to Local Vault
    await localVault.saveMessage(stored);
    setMessages((prev) => [...prev, stored]);
    setInputText('');

    // Send over direct WebRTC DataChannel
    const sent = webrtcRef.current?.sendMessage(p2pMsg);
    if (!sent) {
      console.log('Peer not connected yet; message saved locally to Vault.');
    }
  };

  // Export / Download Chat Transcript to Laptop
  const handleDownloadTranscript = async () => {
    const markdown = await localVault.exportChat(activeSpaceAddress, 'markdown');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WhisperMesh-${activeSpaceAddress}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy Space Address
  const copyMySpace = () => {
    navigator.clipboard.writeText(myOwnSpaceAddress);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
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
                GLOBAL P2P
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>100% Local Vault Storage • WebRTC NAT Traversal</div>
          </div>
        </div>

        {/* Global Connection & Active Space Badges */}
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
            <span>{isGatewayConnected ? 'Broker Online' : 'Offline'}</span>
          </div>

          <button
            onClick={() => setIsConnectModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#93c5fd',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Globe style={{ width: 14, height: 14 }} />
            <span>Connect to Space (⌘K)</span>
          </button>
        </div>
      </header>

      {/* Main Glass Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Sidebar: Machine Unique Space Address & Vault */}
        <aside style={{
          width: 280,
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(10, 15, 28, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 16
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            {/* This Laptop's Unique Space Address */}
            <div style={{
              padding: 14,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Your Unique Space Address
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '1px', color: '#60a5fa' }}>
                  {myOwnSpaceAddress || 'GENERATING...'}
                </span>
                <button
                  onClick={copyMySpace}
                  title="Copy Space Code to share with your friend"
                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  {copiedNotification ? <Check style={{ width: 14, height: 14, color: '#10b981' }} /> : <Copy style={{ width: 14, height: 14 }} />}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Give this code to your friend so they can join your space from any network.
              </div>
            </div>

            {/* Active Space Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Active P2P Tunnel
              </div>
              <div style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: p2pState === 'connected' ? '#10b981' : '#f59e0b',
                    boxShadow: p2pState === 'connected' ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
                  }}></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {activeSpaceAddress}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  Direct WebRTC: <b style={{ color: p2pState === 'connected' ? '#34d399' : '#fbbf24' }}>{p2pState.toUpperCase()}</b>
                </div>
              </div>
            </div>

            {/* Favorite Spaces Quick List */}
            {favoriteSpaces.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Saved Spaces ({favoriteSpaces.length})
                </div>
                {favoriteSpaces.map((fav) => (
                  <button
                    key={fav.spaceAddress}
                    onClick={() => {
                      setActiveSpaceAddress(fav.spaceAddress);
                      gatewayRef.current?.joinSpace(fav.spaceAddress, '000000');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: activeSpaceAddress === fav.spaceAddress ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: activeSpaceAddress === fav.spaceAddress ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                      color: '#fff',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span>⚡ {fav.alias}</span>
                    <ArrowRight style={{ width: 12, height: 12, color: '#9ca3af' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Sidebar: Vault Download & ⌘K Connect Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
            <button
              onClick={handleDownloadTranscript}
              title="Download entire chat history to your laptop (Markdown)"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e5e7eb',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <FolderDown style={{ width: 14, height: 14, color: '#34d399' }} />
              <span>Download Vault Transcript</span>
            </button>

            <button
              onClick={() => setIsConnectModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings style={{ width: 16, height: 16, color: '#60a5fa' }} />
                <span>Connect to Space</span>
              </div>
              <span style={{ fontSize: 11, background: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: 4, color: '#9ca3af' }}>⌘K</span>
            </button>
          </div>
        </aside>

        {/* Center: Live P2P Chat Stream */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Header Bar */}
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.3)',
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
                  Space: {activeSpaceAddress}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  Encrypted Vault: {messages.length} messages saved locally on this laptop
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
                <div style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>Zero Cloud Persistence</div>
                <div style={{ fontSize: 13, maxWidth: 440, margin: '0 auto', lineHeight: 1.5 }}>
                  Share your space code <code style={{ color: '#34d399', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: 4 }}>{myOwnSpaceAddress}</code> with your friend or press <b>⌘K</b> to connect to their space address.
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
              placeholder={p2pState === 'connected' ? 'Type stealth message to peer...' : 'Type message (will sync directly when peer connects)...'}
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

      {/* ========================================================================= */}
      {/* macOS NATIVE "CONNECT TO SERVER" STYLE DIALOG (MATCHING USER SCREENSHOT)   */}
      {/* ========================================================================= */}
      {isConnectModalOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: 500,
            borderRadius: 10,
            background: 'rgba(30, 30, 30, 0.96)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif'
          }}>
            {/* macOS Modal Titlebar with Traffic Lights */}
            <div style={{
              height: 28,
              background: '#262626',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', gap: 7 }}>
                <span onClick={() => setIsConnectModalOpen(false)} style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56', cursor: 'pointer' }}></span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }}></span>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }}></span>
              </div>
              <div style={{ position: 'absolute', width: '100%', left: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#e5e5e5', pointerEvents: 'none' }}>
                Connect to Space
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Space Address Input Field (with blue active glow border matching macOS) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#b3b3b3' }}>Space Address:</label>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <input
                    type="text"
                    value={spaceAddressInput}
                    onChange={(e) => setSpaceAddressInput(e.target.value)}
                    placeholder="e.g. SPACE-ALPHA or friend's space code"
                    style={{
                      width: '100%',
                      background: '#1e1e1e',
                      border: '1.5px solid #007aff',
                      boxShadow: '0 0 0 1px #007aff',
                      borderRadius: 6,
                      padding: '7px 32px 7px 10px',
                      color: '#ffffff',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'monospace'
                    }}
                  />
                  <div style={{ position: 'absolute', right: 8, color: '#888', pointerEvents: 'none', fontSize: 11 }}>
                    ▼
                  </div>
                </div>
              </div>

              {/* 6-Digit OTP / Secret Security Code */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#b3b3b3' }}>Security Secret / OTP (Optional):</label>
                <input
                  type="text"
                  maxLength={6}
                  value={spaceOtpInput}
                  onChange={(e) => setSpaceOtpInput(e.target.value)}
                  placeholder="000000"
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    border: '1px solid #3a3a3a',
                    borderRadius: 6,
                    padding: '7px 10px',
                    color: '#34d399',
                    fontSize: 13,
                    outline: 'none',
                    letterSpacing: '2px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              {/* Favourite Spaces Box (exact macOS list styling) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: '#b3b3b3' }}>Favourite Spaces:</label>
                <div style={{
                  height: 100,
                  background: '#1a1a1a',
                  border: '1px solid #333333',
                  borderRadius: 4,
                  overflowY: 'auto'
                }}>
                  {favoriteSpaces.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 12, padding: 10 }}>No favourite spaces added yet.</div>
                  ) : (
                    favoriteSpaces.map((fav) => (
                      <div
                        key={fav.spaceAddress}
                        onClick={() => {
                          setSelectedFavorite(fav.spaceAddress);
                          setSpaceAddressInput(fav.spaceAddress);
                        }}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          color: selectedFavorite === fav.spaceAddress ? '#ffffff' : '#cccccc',
                          background: selectedFavorite === fav.spaceAddress ? '#007aff' : 'transparent',
                          cursor: 'pointer',
                          fontFamily: 'monospace'
                        }}
                      >
                        ⚡ {fav.spaceAddress}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Bottom Control Buttons (Plus, Minus, Options, Browse, Connect) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    display: 'flex',
                    background: '#2a2a2a',
                    border: '1px solid #3a3a3a',
                    borderRadius: 5,
                    overflow: 'hidden'
                  }}>
                    <button
                      onClick={handleAddFavorite}
                      title="Add current address to favourites"
                      style={{ padding: '4px 10px', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer' }}
                    >
                      <Plus style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={handleRemoveFavorite}
                      title="Remove selected favourite"
                      style={{ padding: '4px 10px', background: 'transparent', borderLeft: '1px solid #3a3a3a', borderRight: '1px solid #3a3a3a', borderTop: 'none', borderBottom: 'none', color: '#ccc', cursor: 'pointer' }}
                    >
                      <Minus style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      onClick={() => setSpaceAddressInput(myOwnSpaceAddress)}
                      title="Restore my own unique space code"
                      style={{ padding: '4px 10px', background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer' }}
                    >
                      <MoreHorizontal style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  <button
                    onClick={() => alert(`WhisperMesh Space Architecture:\n• Space Code: ${myOwnSpaceAddress}\n• All chats are stored 100% locally in your Mac's Vault.\n• STUN servers punch through firewalls across different Wi-Fi/networks.`)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      background: '#2a2a2a',
                      border: '1px solid #3a3a3a',
                      color: '#aaa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <HelpCircle style={{ width: 14, height: 14 }} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setIsConnectModalOpen(false)}
                    style={{
                      background: '#333333',
                      border: '1px solid #444444',
                      borderRadius: 6,
                      padding: '6px 14px',
                      color: '#ffffff',
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConnectToSpace}
                    style={{
                      background: '#007aff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 18px',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Connect
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
