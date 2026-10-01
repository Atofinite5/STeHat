# Architectural Blueprint: Live Stealth P2P Presence & Direct WebRTC Chat Engine

```
                          ┌────────────────────────────────────────────────────────┐
                          │         CENTRAL SIGNALING & DISCOVERY GATEWAY          │
                          │        (Fastify WebSocket Gateway + Redis Cache)       │
                          │   ws://localhost:4000/v1/gateway (or Cloud URL)        │
                          └───────────▲────────────────────────────────▲───────────┘
                                      │                                │
                 1. Ephemeral Register│                                │ 1. Ephemeral Register
                 & 15s Heartbeats     │                                │ & 15s Heartbeats
                                      │                                │
                     ┌────────────────┴──────────────┐   ┌─────────────┴─────────────────┐
                     │    LOCAL LAPTOP (Alice)       │   │    REMOTE LAPTOP (Bob)        │
                     │  Tauri 2 + Native Rust Core   │   │  Tauri 2 + Native Rust Core   │
                     │  Glassy Stealth Cyber UI      │   │  Glassy Stealth Cyber UI      │
                     └───────────────┬───────────────┘   └─────────────┬─────────────────┘
                                     │                                 │
                                     │  2. CONNECTION_REQUEST (Alice)  │
                                     │────────────────────────────────►│
                                     │                                 │
                                     │  3. 6-Digit Mutual CSPRNG Code  │
                                     │◄────────────────────────────────│
                                     │                                 │
                                     │  4. WebRTC SDP Offer / Answer   │
                                     │◄═══════════════════════════════►│
                                     │   (Exchanged via Gateway WSS)   │
                                     │                                 │
                                     │                                 │
                                     ▼                                 ▼
                     ┌───────────────────────────────────────────────────────────────────┐
                     │          DIRECT PEER-TO-PEER ENCRYPTED WEBRTC DATACHANNEL         │
                     │                 (rtc.createDataChannel("whisper"))                │
                     │                                                                   │
                     │  • Low-latency text messaging (<15ms)                             │
                     │  • Zero server persistence / zero message logging                 │
                     │  • Direct NAT-traversed UDP socket                                │
                     │  • coturn relay fallback on symmetric NAT                         │
                     │  • Ed25519 identity verification via Rust Tauri IPC               │
                     └───────────────────────────────────────────────────────────────────┘
```

---

## Technical Specifications for the Transformation

### 1. Visual Design: "Stealth Cyber Glass" (macOS Vibrancy & Glassmorphism)
- **Window Treatment:** Borderless translucent titlebar (`titleBarStyle: "Overlay"`), frosted glass acrylic blur (`backdrop-filter: blur(28px)`), semi-transparent deep midnight background (`rgba(8, 12, 22, 0.72)`).
- **Aesthetics:** Cyberpunk/stealth military-grade typography, glowing emerald P2P connection telemetry, micro-animations, glass cards with thin neon-tinted borders (`rgba(255, 255, 255, 0.08)`).
- **Audio & Haptic Feedback:** Live visualizer waveforms, status telemetry indicators.

### 2. Live Dynamic Networking (No Hardcoded Mocking)
- **Auto-Discovery:** Upon launch, app connects to the signaling gateway via WebSocket (`new WebSocket(...)`).
- **Presence Lifecycle:** Emits `PRESENCE_REGISTER` with real machine identity (fetched from Rust `CryptoEngine`). Pings every 15s (`PRESENCE_HEARTBEAT`). Auto-receives `PRESENCE_SNAPSHOT` and live `PRESENCE_UPDATE` when any peer connects on any laptop.
- **Mutual Pairing & Negotiation:**
  1. Laptop A clicks **"Pair & Connect"** on Laptop B.
  2. Signaling server generates a 6-digit CSPRNG pairing code and transmits a challenge to both laptops.
  3. Both users verify/confirm the code.
  4. WebRTC `RTCPeerConnection` initializes with STUN/TURN ICE servers.
  5. SDP Offer/Answer and ICE candidates are automatically exchanged through the gateway.
  6. The `RTCDataChannel` opens (`dc.readyState === 'open'`).
- **Direct P2P DataChannel Messaging:**
  - Messages travel **directly over the WebRTC DataChannel** from laptop to laptop.
  - Zero messages pass through the server. Zero server database logging.

### 3. Native Tauri 2 + Rust Integration
- Rust commands for:
  - `generate_identity`: Generates hardware-entropy Ed25519 identity.
  - `get_device_id`: Returns persistent machine fingerprint.
  - `sign_challenge`: Signs cryptographic pairing challenges.
