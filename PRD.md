# WhisperMesh — Product Requirements Document (PRD)

## Document Details
- **Product Name:** WhisperMesh
- **Document Version:** 1.0.0
- **Status:** Draft / Ready for Engineering Execution
- **Product Type:** Cross-Platform, Privacy-Focused, Low-Latency Peer-to-Peer Presence and Chat Application

---

## 1. Product Overview
WhisperMesh is a cross-platform, privacy-focused, low-latency peer-to-peer (P2P) presence and messaging application targeting macOS, Windows, Android, and iOS. The product enables geographically dispersed users across distinct networks, ISPs, and devices to discover each other within an ephemeral global presence space, initiate mutual connection requests, verify identity through short-lived numeric pairing codes, and conduct secure, end-to-end encrypted realtime text messaging via WebRTC DataChannels with automated TURN relay fallback.

---

## 2. Problem Statement
Contemporary messaging platforms predominantly rely on centralized message-routing architectures where plaintext, metadata, and messaging graphs traverse and persist on third-party servers. Conversely, existing peer-to-peer applications frequently suffer from severe structural limitations:
1. **Network Discovery Barriers:** Many local-first or P2P tools rely strictly on Local Area Network (LAN) discovery (e.g., mDNS, Bonjour), preventing cross-network communication between users across heterogeneous cellular and broadband networks.
2. **Complex Onboarding and Identity Burdens:** Users are forced into phone number verification, centralized email accounts, or cumbersome cryptographic key exchanges.
3. **NAT and Firewall Traversal Failures:** Direct P2P networks fail completely under Symmetric NATs or strict carrier-grade NAT (CGNAT) without managed relay traversal.
4. **Heavy Resource Footprints:** Existing cross-platform desktop and mobile clients frequently bundle heavyweight web runtimes with high memory overhead and sluggish responsiveness.

WhisperMesh resolves these issues by pairing an ultra-lightweight central coordination plane (ephemeral WebSocket presence and signaling) with a robust hybrid peer-to-peer data plane (WebRTC DataChannels with STUN/TURN).

---

## 3. Product Vision
Deliver a universally accessible, lightweight, and zero-trust communication tool where any two users in the world can instantly discover one another, establish cryptographic trust in seconds through human-verifiable pairing codes, and communicate with minimum latency, zero server-side message persistence, and complete network independence.

---

## 4. Goals
- **Universal Cross-Network Reachability:** Connect users across disparate ISPs, mobile carrier networks, Wi-Fi setups, and corporate/home NATs worldwide without requiring a shared local network.
- **True Multi-Platform Parity:** Deliver identical core functionality and wire-protocol compatibility across macOS, Windows, Android, and iOS.
- **Zero-Knowledge Core Messaging:** Guarantee that server infrastructure never sees, intercepts, or stores plaintext chat messages or private cryptographic keys.
- **Low Latency Communication:** Ensure interactive sub-second messaging delivery using WebRTC DataChannel P2P transports.
- **Low Operational Overhead:** Maintain minimal server-side resource footprints using ephemeral Redis data structures, lightweight Fastify signaling, and strict prioritization of direct P2P data flow to minimize TURN bandwidth costs.
- **Frictionless Verification:** Provide single-use, rate-limited, short-lived pairing-code verification that prevents man-in-the-middle (MITM) attacks without requiring out-of-band key gymnastics.

---

## 5. Non-Goals
- **No Permanent Message Storage on Servers:** The central infrastructure will not persist, buffer, or archive chat transcripts under any circumstances.
- **No Social Graph or Public Profiles:** No user directories, contact address books, persistent follower lists, public profiles, avatars, or discovery algorithms.
- **No Algorithmic Discovery or Feed Mechanics:** No recommendations, matchmaking, user search queries beyond explicit active presence, or algorithmic ranking.
- **No AI Bots or Virtual Assistants:** Exclude in-client or server-side artificial intelligence assistants, generative chatbots, and automated response systems.
- **No Voice or Video Calling in MVP:** MVP is strictly constrained to bidirectional text messaging and connection lifecycle primitives.
- **No Group Chat in MVP:** Multi-peer mesh or SFU-based group communications are strictly excluded from the initial release; all sessions are point-to-point (1-to-1).
- **No Bulk File or Media Synchronization in MVP:** No file sharing, binary streaming, media caching, or chunked document transport in the initial scope.
- **No Analytics / Telemetry Snooping:** No third-party behavioral analytics, ad-tracking SDKs, or invasive device telemetry.

---

## 6. Target Users
- **Privacy-Sensitive Collaborators:** Users requiring immediate, zero-trace, transient communication channels free from centralized corporate logging and data-at-rest subpoena risks.
- **Remote Technical Teams & Operators:** Engineers and systems administrators operating across varying network topologies needing rapid, direct peer-to-peer verification and messaging.
- **Everyday Users Across Restrictive Networks:** Individuals communicating across disparate cellular carriers, mobile data networks, and domestic/international ISPs who desire an instant, clean, zero-onboarding chat utility.

---

## 7. User Stories
- **US-01:** As a new user, I want to download and open the app on my desktop or mobile device and set an ephemeral display name without providing an email, phone number, or password.
- **US-02:** As an active user, I want the system to automatically generate a cryptographic identity bound to my device so my security keys remain local and secure.
- **US-03:** As an active user, I want to see a live list of other available users globally, including their display name, platform, and availability state, regardless of their network or geographic location.
- **US-04:** As an active user, I want to select an available peer and send a connection request so that we can begin a private communication session.
- **US-05:** As a recipient, I want to receive an incoming connection notification with the sender's display name and device platform, with the option to accept or reject the request.
- **US-06:** As both initiating and receiving peers, I want to see a matching short-lived numeric pairing code upon request acceptance so that we can verify and authenticate each other before opening a data channel.
- **US-07:** As a connected user, I want my messages to travel directly peer-to-peer via WebRTC DataChannels with minimum latency, falling back to an encrypted TURN relay automatically if our network firewalls block direct connection.
- **US-08:** As a connected user, I want to see real-time delivery state indicators for messages sent during the active session.
- **US-09:** As an intermittent user, I want the application to automatically transition my presence to offline when I lose network connectivity, and seamlessly recover my connection state upon network restoration.
- **US-10:** As a privacy-conscious user, I want all active session messages wiped when I close the session or terminate the application.

---

## 8. Core User Flows

```
[Available User]
       │
       ▼
[Initiate Connection Request]
       │
       ▼
[Recipient Prompts Accept / Reject]
  ├── (Reject) ──► [Notify Initiator: Rejected] ──► [End Session]
  └── (Accept) ──► [Generate Ephemeral Pairing Session & Numeric Code]
                         │
                         ▼
             [Pairing Code Verification]
                         │
                         ▼
             [Cryptographic Key Exchange / Auth]
                         │
                         ▼
             [WebRTC Signaling (Offer / Answer / ICE)]
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
  [Direct P2P DataChannel]     [Fallback to TURN Relay]
          │                             │
          └──────────────┬──────────────┘
                         ▼
              [Active Encrypted Chat]
```

### Flow 1: Device Initialization and Presence Join
1. User installs and opens WhisperMesh.
2. If first launch, user enters a display name (persisted locally).
3. Client generates a local cryptographic device identity (Ed25519 signing key pair, X25519 key-agreement pair, and unique UUIDv4 device identifier). Private keys are committed to secure local storage.
4. Client opens a secure WebSocket connection (`wss://`) to the central presence and signaling service.
5. Client issues a `PRESENCE_REGISTER` payload containing Device ID, Public Keys, Display Name, and Platform identifier.
6. Central presence service updates Redis ephemeral store and acknowledges registration.
7. Client transitions state to `Available` and receives the current global directory snapshot of available peers.
8. Client initiates background WebSocket heartbeat interval (every 15 seconds).

### Flow 2: Connection Request and Peer Pairing
1. User A views User B in the Available list and clicks "Connect".
2. User A's client sends `CONNECTION_REQUEST` to the server targeting User B's Device ID.
3. Server validates rate limits and forwards the request to User B via WebSocket. User A transitions UI state to `Connecting`.
4. User B receives an interactive modal showing User A's display name, platform, and incoming request.
5. If User B rejects: Server notifies User A (`CONNECTION_REJECT`); both return to `Available`.
6. If User B accepts: Server creates an ephemeral pairing session, generates an entropy-backed 6-digit numeric verification code, applies a 60-second time-to-live (TTL), and transmits the code and session context to both User A and User B.
7. Both clients render the pairing code on-screen. Users visually/verbally verify matching codes and confirm verification via UI action.
8. Upon mutual confirmation, clients sign the pairing session challenge using their private keys and transmit verification proofs to the signaling server.
9. Server confirms cryptographic validity and grants signaling authorization for the pair.

### Flow 3: WebRTC Negotiation and Encrypted Chat Session
1. Initiator (User A) creates a WebRTC `RTCPeerConnection` with configured STUN and TURN server credentials provided during signaling authorization.
2. User A creates a reliable, ordered WebRTC DataChannel (`whispermesh-data`).
3. User A generates an SDP Offer; sends it via server signaling payload `OFFER` to User B.
4. User B receives `OFFER`, sets remote description, generates SDP Answer, and transmits `ANSWER` to User A.
5. Both clients collect ICE candidates and exchange them asynchronously via `ICE_CANDIDATE` signaling messages.
6. Clients perform ICE connectivity checks:
   - Direct peer-to-peer route discovered: Direct UDP/TCP DataChannel opens.
   - Symmetric NAT / CGNAT prevents direct route: ICE falls back to TURN relay allocation.
7. WebRTC DataChannel state changes to `open`.
8. UI transitions state to `Connected`.
9. Users transmit binary-encoded `TEXT` messages directly through the DataChannel.
10. Receiving client responds immediately across the DataChannel with an authenticated `ACK` / `DELIVERED` packet.

### Flow 4: Disconnection and Graceful Teardown
1. Either user clicks "Disconnect" or closes the application.
2. Client sends a `DISCONNECT` control frame across the DataChannel, closes the `RTCPeerConnection`, and notifies the signaling server via WebSocket.
3. Both clients purge in-memory session message history, clear active encryption context, and return UI to `Available`.
4. If a client terminates unexpectedly (e.g., process killed or network dropped), the presence heartbeat on the server times out after 30 seconds. Redis evicts the presence record and broadcasts a `PRESENCE_OFFLINE` event to all active peers.

---

## 9. Functional Requirements

### 9.1 Identity and Onboarding
- **FR-01:** System must allow the user to set and locally update an alphanumeric display name (1–32 characters) without central authentication credentials.
- **FR-02:** System must generate an asymmetric cryptographic key pair directly on the client during first launch:
  - Ed25519 for identity signing and verification.
  - X25519 for Diffie-Hellman key agreement.
- **FR-03:** Client must generate a persistent UUIDv4 Device ID upon initial installation.
- **FR-04:** Private keys must never leave the client device under any condition.
- **FR-05:** System must detect and report the host operating system platform (`macOS`, `Windows`, `Android`, `iOS`) and hardware form factor (Desktop vs. Mobile).

### 9.2 Global Presence Management
- **FR-06:** Client must establish an encrypted WebSocket connection (`wss://`) to the presence server upon application launch.
- **FR-07:** Presence service must maintain ephemeral device records containing: `device_id`, `display_name`, `platform`, `public_key`, `status`, and `last_seen_timestamp`.
- **FR-08:** System must support four discrete presence states: `Available`, `Connecting`, `Connected`, and `Offline`.
- **FR-09:** Client must transmit heartbeats (`PING`) at fixed 15-second intervals.
- **FR-10:** Server must evict client records and mark the device `Offline` if no heartbeat or activity is received within a 30-second window.
- **FR-11:** Server must broadcast incremental presence updates (`PRESENCE_UPDATE`, `PRESENCE_OFFLINE`) to all connected clients.
- **FR-12:** Client must automatically attempt WebSocket reconnection with exponential backoff upon network interruption.

### 9.3 Connection Requests and Session Initiation
- **FR-13:** An `Available` user must be able to send a targeted `CONNECTION_REQUEST` to any other `Available` user.
- **FR-14:** Recipient must receive real-time request alerts displaying sender's name and platform with explicit `Accept` and `Reject` actions.
- **FR-15:** If the target user is in a state other than `Available` (e.g., `Connecting` or `Connected`), the server must reject the request with `PEER_BUSY`.
- **FR-16:** Connection requests must automatically timeout after 30 seconds if unhandled by the recipient.

### 9.4 Verification and Pairing
- **FR-17:** Upon acceptance of a request, the server must generate a cryptographically random, 6-digit numeric pairing code bound to the unique session ID.
- **FR-18:** The pairing code must have a strict time-to-live (TTL) of 60 seconds.
- **FR-19:** Clients must present the pairing code prominently in the user interface.
- **FR-20:** System must enforce mutual confirmation: both peers must confirm match before signaling can proceed.
- **FR-21:** The pairing endpoint must enforce rate-limiting: maximum 3 failed verification attempts per session, after which the session is terminated and marked invalid.
- **FR-22:** System must verify mutual Ed25519 digital signatures of the pairing session challenge prior to opening WebRTC signaling channels.

### 9.5 Signaling and WebRTC Connection
- **FR-23:** Server must route SDP Offers, SDP Answers, and ICE Candidates strictly between mutually authorized, paired peers.
- **FR-24:** System must query and configure STUN servers for standard NAT discovery.
- **FR-25:** System must provision short-lived TURN relay credentials (RFC 5766 / RFC 8489) using the time-limited credential mechanism when direct P2P connectivity fails.
- **FR-26:** WebRTC implementation must establish an SCTP-based DataChannel configured for reliable, ordered delivery.
- **FR-27:** System must automatically detect DataChannel state transitions (`connecting`, `open`, `closing`, `closed`) and reflect them immediately in UI.

### 9.6 Messaging and Session Lifecycle
- **FR-28:** Clients must exchange text messages using serialized binary protocol messages (MessagePack or Protocol Buffers) over the DataChannel.
- **FR-29:** Each message must contain a UUIDv4 message ID, epoch timestamp, sender ID, session ID, payload, and cryptographic signature.
- **FR-30:** Client must issue immediate acknowledgement frames (`ACK`, `DELIVERED`) upon processing inbound messages.
- **FR-31:** In-memory message history must only be maintained for the duration of the active session.
- **FR-32:** Explicit termination by either party (`DISCONNECT`) or window close must purge the session message transcript from memory.

---

## 10. Non-Functional Requirements

### 10.1 Security and Cryptography
- **NFR-01 (Transport Encryption):** All signaling and presence traffic must mandate TLS 1.3. WebRTC DataChannels must enforce DTLS 1.2 / 1.3 with AES-GCM cipher suites.
- **NFR-02 (Zero Server Visibility):** Central servers must never have access to private keys or plaintext DataChannel payloads.
- **NFR-03 (Replay Protection):** All signaling payloads and DataChannel frames must include monotonically increasing sequence counters and timestamp checks (reject skew > 30 seconds).
- **NFR-04 (Brute-Force Resistance):** Server-side pairing rate limiter must block IP addresses exceeding 10 failed pairing attempts per rolling hour.
- **NFR-05 (Key Storage):** On desktop, cryptographic keys must be stored using platform-native secure enclaves (macOS Keychain, Windows Credential Manager / DPAPI). On mobile, keys must use iOS Keychain (with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and Android Keystore.
- **NFR-06 (No Custom Crypto):** All cryptographic operations must utilize audited implementations of standard primitives: Ed25519 (RFC 8032), X25519 (RFC 7748), and HKDF-SHA256 (RFC 5869).

### 10.2 Performance and Latency
- **NFR-07 (Startup Time):** Client application cold startup to interactive presence view must complete within ≤ 1,200 ms on desktop and ≤ 1,800 ms on mobile (under standard device workloads).
- **NFR-08 (Presence Propagation):** Server-side presence changes must propagate to 95% of active clients globally within ≤ 300 ms (excluding network transit delay).
- **NFR-09 (Signaling Exchange):** Internal signaling routing latency (Offer/Answer passing through server) must be ≤ 50 ms at the 99th percentile.
- **NFR-10 (Direct P2P Message Latency):** P2P DataChannel one-way text message delivery must be ≤ 80 ms + round-trip time (RTT) between peer networks.
- **NFR-11 (Relayed Message Latency):** TURN-relayed message delivery must be ≤ 150 ms + combined RTT to relay.
- **NFR-12 (Memory Footprint):** Desktop client idle resident set size (RSS) must not exceed 90 MB. Mobile client memory usage must not exceed 60 MB.

### 10.3 Reliability and Network Resilience
- **NFR-13 (P2P Traversal Success):** The hybrid connection architecture (STUN direct + TURN fallback) must achieve ≥ 99.5% connection success across heterogeneous NAT topologies.
- **NFR-14 (Automatic Reconnection):** Following an ungraceful transport drop (e.g., Wi-Fi to cellular handover), client must attempt ICE restart within 2,000 ms without user manual intervention.
- **NFR-15 (Service Availability):** Presence and signaling backend availability must meet or exceed 99.9% uptime during operational service windows.

### 10.4 Scalability and Resource Efficiency
- **NFR-16 (Backend Concurrency):** A single backend signaling node (4 vCPU, 8 GB RAM) must handle a minimum of 25,000 concurrent active WebSocket connections.
- **NFR-17 (Bandwidth Minimization):** WebSocket heartbeat frames must not exceed 64 bytes per frame. Ephemeral presence updates must use delta compression.

---

## 11. UX Requirements

### 11.1 General UX Principles
- **Minimalist Utility:** Clean, distraction-free interface prioritizing speed, presence clarity, and connection status.
- **Zero Configuration:** No account setup, password creation, or server configuration screens.
- **Instant System Feedback:** Continuous, explicit visual indications of network state, peer availability, and cryptographic verification status.

### 11.2 Core Screens and Views

#### 11.2.1 Onboarding / Welcome Modal (First Run Only)
- Minimal modal requesting a `Display Name`.
- Auto-detected platform display (e.g., "Detected: macOS Desktop").
- Single confirmation action: "Enter Mesh".

#### 11.2.2 Main Dashboard (Global Presence View)
- **Top Header Bar:**
  - Application Identity ("WhisperMesh").
  - Current User Status Badge: Visual green/grey indicator ("● ONLINE" / "○ OFFLINE").
  - Current User Profile Display: `[Display Name] • [Platform Icon/Label]`.
  - Global Availability Toggle Switch (Available / Busy).
- **People Directory (Active Users List):**
  - Section header: `PEOPLE (COUNT)`.
  - Filter / Search bar for filtering visible display names in real time.
  - List entries displaying:
    - Status Indicator (`● Available` in green, `○ Offline` in muted grey).
    - Peer Display Name.
    - Device and Platform Identifier (e.g., "MacBook • macOS", "iPhone • iOS", "Pixel 8 • Android").
    - Action Button: "Connect" (enabled only when peer is `Available`).

#### 11.2.3 Connection Request & Pairing Modal
- **Initiator View:**
  - Spinner with label: "Requesting connection with [Peer Name]...".
  - "Cancel" button.
  - Upon acceptance: Renders 6-digit numeric pairing code (formatted as `XXX - XXX` in high-contrast monospaced font).
  - Explicit confirmation toggle: "I confirm the code matches on [Peer Name]'s screen".
- **Recipient View:**
  - Incoming alert with audio/haptic pulse.
  - Text: "[Peer Name] ([Platform]) wants to connect".
  - Actions: "Accept" (primary) and "Decline" (secondary destructive).
  - Upon accept: Displays identical 6-digit numeric code with match confirmation action.

#### 11.2.4 Active Chat View
- **Header:**
  - Remote peer display name and device badge.
  - Connection Mode Badge: "Direct P2P (Low Latency)" [Green] or "TURN Relayed" [Amber].
  - "Disconnect" button (terminates session).
- **Message Transcript Area:**
  - Chronological list of message bubbles (Local: Right-aligned; Remote: Left-aligned).
  - Message bubble metadata: Timestamp and Delivery State checkmarks:
    - Single checkmark: Sent to transport.
    - Double checkmark: Acknowledged by remote client.
- **Input Area:**
  - Auto-expanding text input field supporting multiline text (Shift+Enter for newline; Enter to send).
  - Send button (disabled if input empty or connection disconnected).
- **Reconnection Banner:**
  - Persistent alert banner if connection is interrupted: "Network interrupted. Attempting automatic reconnection...".

---

## 12. Platform Requirements

| Platform | Minimum OS Version | Architecture Support | Distribution Packaging | Native Integrations |
| :--- | :--- | :--- | :--- | :--- |
| **macOS** | macOS 11.0 (Big Sur) or later | Apple Silicon (arm64), Intel (x86_64) | Universal `.dmg`, signed `.app` | Apple Keychain, OS Notifications |
| **Windows** | Windows 10 (1809+) & Windows 11 | x86_64, ARM64 | Signed `.msi` / NSIS installer | Windows DPAPI / Credential Vault |
| **Android** | Android 9.0 (API Level 28)+ | arm64-v8a, armeabi-v7a | Universal `.apk` release bundle | Android Keystore, Foreground Service |
| **iOS** | iOS 15.0+ | arm64 | Ad-hoc / TestFlight / `.ipa` | iOS Keychain, Background Tasks |

---

## 13. System Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │                    WhisperMesh Cloud                   │
                    │                                                        │
                    │   ┌─────────────────────┐   ┌──────────────────────┐   │
                    │   │ Fastify Backend     │   │ coturn Infrastructure│   │
                    │   │ Signaling & Presence│   │ STUN / TURN Relay    │   │
                    │   │ (Node.js/TypeScript)│   │ (RFC 5389 / 5766)    │   │
                    │   └──────────┬──────────┘   └──────────┬───────────┘   │
                    │              │                         │               │
                    │   ┌──────────┴──────────┐              │               │
                    │   │ Redis (Ephemeral)   │              │               │
                    │   │ + Postgres (Meta)   │              │               │
                    │   └─────────────────────┘              │               │
                    └──────────────┼─────────────────────────┼───────────────┘
                                   │ WSS                     │
            ┌──────────────────────┴──────┐                  │ UDP / TCP
            │                             │                  │ (Fallback)
            ▼                             ▼                  │
 ┌──────────────────────┐      ┌──────────────────────┐      │
 │  Client A (Desktop)  │      │  Client B (Mobile)   │      │
 │  Tauri 2 + Rust Core │      │  React Native + Core │◄─────┘
 │  React/TS UI Layer   │      │  React/TS UI Layer   │
 └──────────┬───────────┘      └──────────┬───────────┘
            │                             │
            └──────── WebRTC P2P ─────────┘
                 (DataChannel - Direct)
```

The system operates on a dual-plane architecture:
1. **Control Plane (Centralized, Ephemeral):** Operates over secure WebSockets connected to a Fastify/Node.js cluster backed by Redis for high-throughput state storage. Coordinates presence heartbeats, connection negotiations, pairing verification, and WebRTC SDP/ICE signaling.
2. **Data Plane (Decentralized, Peer-to-Peer):** Operates directly between paired client devices via WebRTC SCTP DataChannels. In the event of restrictive Symmetric NAT firewalls, the data plane routes through an authenticated coturn TURN relay instance.

---

## 14. Client Architecture

### 14.1 Desktop Architecture (macOS & Windows)
Built using **Tauri 2**, separating low-level native concerns from presentation logic:
- **Rust Core Layer:**
  - Secure storage operations (OS keychain integration via platform APIs).
  - Cryptographic key generation, signature verification, and session token generation via audited Rust crates (`ed25519-dalek`, `x25519-dalek`).
  - Native OS power management, tray integration, and socket lifecycle hooks.
  - High-performance binary serialization/deserialization for wire messages.
- **Webview UI Layer (React + TypeScript):**
  - Declarative state management for directory listing, presence badges, and active chat transcripts.
  - Standard WebRTC API bindings provided by the native Webview engine for `RTCPeerConnection` and `RTCDataChannel`.
  - Inter-Process Communication (IPC) via strictly typed Tauri commands to Rust backend.

### 14.2 Mobile Architecture (Android & iOS)
Built using **React Native + TypeScript**:
- **Native Modules (Swift / Kotlin):**
  - Native security bindings to Android Keystore and iOS Keychain.
  - Native WebRTC engine bindings utilizing `react-native-webrtc` (wrapping Google's native WebRTC C++ library).
  - Mobile background network management, handling socket suspension and fast reconnection upon app foregrounding.
- **Shared UI & Protocol Abstraction:**
  - Identical TypeScript state stores, protocol parsers, and UI components shared across desktop and mobile UI views.

---

## 15. Backend Architecture

### 15.1 Application Server (Fastify + TypeScript)
- **Fastify Framework:** Chosen for maximum I/O throughput and low-overhead HTTP/WebSocket routing.
- **`@fastify/websocket`:** Manages concurrent persistent client connections.
- **Presence Controller:** Ingests heartbeats, updates TTL-backed records, and publishes presence updates to Redis pub/sub.
- **Signaling Controller:** Validates session pairing states and forwards SDP offers, answers, and ICE candidates strictly between verified pairs.
- **Pairing Engine:** Generates cryptographically secure 6-digit codes, calculates TTLs, verifies Ed25519 signatures, and prevents session hijacking.

### 15.2 Storage Infrastructure
- **Redis (Ephemeral Presence Store & Pub/Sub):**
  - Stores volatile presence state with active key expiration (`SET user:presence:<device_id> EX 30`).
  - Facilitates horizontal scaling of signaling nodes via Redis Pub/Sub channels for cross-node message routing.
  - Stores active pairing session tokens with 60-second automatic eviction.
- **PostgreSQL (Durable Metadata):**
  - Stores non-volatile platform records (system settings, blacklisted IP ranges, TURN credential signing secrets).
  - *Strict Exclusion:* Zero chat messages, message identifiers, or user social graphs are ever persisted in PostgreSQL.

---

## 16. Networking Architecture

### 16.1 Hybrid Traversal Strategy
1. **Interactive Connectivity Establishment (ICE - RFC 8445):**
   - Collects host candidates (local network interfaces).
   - Collects server reflexive candidates (STUN - RFC 5389) to discover public mapped IP and port.
   - Collects relay candidates (TURN - RFC 5766) for restricted environments.
2. **Priority Resolution:**
   - Client prioritizes Direct UDP P2P > Direct TCP P2P > TURN UDP Relay > TURN TLS Relay (TCP port 443).
3. **TURN Allocation Lifecycle:**
   - Short-lived, HMAC-SHA-1 ephemeral credentials generated via REST API on the signaling backend (valid for 10 minutes).
   - TURN allocation requested only when direct ICE candidates fail connectivity checks.

---

## 17. Presence Architecture

### 17.1 Presence Data Schema (In Redis)
- **Key:** `presence:device:<device_id>` (String, with TTL = 30 seconds).
- **Value (JSON Encoded):**
  ```json
  {
    "device_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "display_name": "Bhargav",
    "platform": "macOS",
    "public_key": "MCowBQYDK2VwAyEA9Y...",
    "status": "AVAILABLE",
    "connected_node": "sig-node-03",
    "updated_at": 1727337145000
  }
  ```

### 17.2 Presence States & Transitions
- **`Available`:** Device connected via WebSocket, heartbeats active, free to receive connection requests.
- **`Connecting`:** Device has initiated or received an active connection request; pairing or WebRTC negotiation in progress.
- **`Connected`:** Device currently has an active WebRTC DataChannel session established with a peer.
- **`Offline`:** WebSocket disconnected, heartbeat expired, or device terminated. Presence record pruned from Redis.

---

## 18. Pairing Architecture

### 18.1 Pairing Code Generation Properties
- **Entropy:** Generated using a cryptographically secure pseudorandom number generator (CSPRNG) on the signaling server.
- **Format:** 6 decimal digits (`[0-9]{6}`), rendered as two 3-digit clusters (e.g., `492 108`).
- **Single-Use Binding:** Bound strictly to the tuple `(session_id, initiator_device_id, recipient_device_id)`.
- **Expiration:** Automatic invalidation after 60 seconds.
- **Brute Force Defense:** Maximum 3 verification attempts. Any failed signature or mismatch terminates the session immediately.

---

## 19. Security Architecture

### 19.1 Threat Model & Mitigations

| Threat | Description | Mitigation Strategy |
| :--- | :--- | :--- |
| **Man-in-the-Middle (MITM)** | Malicious entity intercepts signaling traffic to insert its own public keys. | Visual verification of the 6-digit out-of-band pairing code coupled with cryptographic signing of the session handshake via local Ed25519 keys. |
| **Eavesdropping on Relay** | Malicious or compromised TURN server inspects relayed communication. | All WebRTC DataChannels mandate end-to-end DTLS encryption. TURN servers process opaque, encrypted packets and cannot access plaintext. |
| **Presence Snooping** | Adversary attempts to map IP addresses of active users via directory. | The global presence directory strictly exposes display names, device platforms, and public keys. Client IP addresses are never exposed via presence or signaling. |
| **Signaling Hijacking** | Unauthorized client injects SDP offers/answers into foreign sessions. | Signaling server validates session authorization tokens signed by the Pairing Engine prior to routing any SDP/ICE messages. |
| **Replay Attacks** | Attacker replays intercepted connection requests or verification messages. | Every message includes a unique nonce, monotonic counter, and short-lived timestamp checked against a 30-second sliding replay window. |

### 19.2 Cryptographic Primitives
- **Identity & Authentication:** Ed25519 (Edwards-curve Digital Signature Algorithm).
- **Key Agreement (Signaling Handshake):** X25519 (Elliptic-curve Diffie-Hellman over Curve25519).
- **Transport Security (Signaling):** TLS 1.3 with standard browser/OS root certificate validation.
- **Transport Security (DataChannel):** DTLS 1.2 / 1.3 utilizing `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256`.

---

## 20. Data Model

### 20.1 Client Local Storage (Non-Volatile)
Managed locally via platform secure storage:
- `identity.device_id`: UUIDv4 string.
- `identity.display_name`: UTF-8 string (1–32 chars).
- `identity.ed25519_private_key`: 32-byte seed.
- `identity.ed25519_public_key`: 32-byte public key.
- `identity.x25519_private_key`: 32-byte private key.
- `identity.x25519_public_key`: 32-byte public key.

### 20.2 In-Memory Session State (Volatile)
Purged on session termination or application exit:
- `active_session.session_id`: UUIDv4 string.
- `active_session.peer_device_id`: UUIDv4 string.
- `active_session.peer_display_name`: UTF-8 string.
- `active_session.peer_platform`: String.
- `active_session.connection_state`: Enum (`IDLE`, `REQUESTING`, `PAIRING`, `CONNECTING`, `CONNECTED`).
- `active_session.transport_mode`: Enum (`DIRECT_P2P`, `TURN_RELAY`).
- `active_session.messages`: Array of `MessageObject`:
  - `message_id`: UUIDv4 string.
  - `sender_id`: UUIDv4 string.
  - `timestamp`: Unix timestamp (milliseconds).
  - `content`: Plaintext UTF-8 string.
  - `delivery_state`: Enum (`SENDING`, `SENT`, `DELIVERED`, `FAILED`).

---

## 21. API Requirements

### 21.1 WebSocket Gateway API (`wss://api.whispermesh.net/v1/gateway`)
The primary bidirectional control channel. All frames are JSON or binary MessagePack payloads conforming to a standardized message envelope.

#### Request Envelope:
```json
{
  "type": "STRING",
  "message_id": "UUIDv4",
  "timestamp": 1727337200000,
  "payload": {}
}
```

#### Event Catalog:
- `PRESENCE_REGISTER`: Client registration upon connection.
- `PRESENCE_HEARTBEAT`: Periodic 15-second keep-alive frame.
- `PRESENCE_UPDATE`: Server broadcast announcing peer status change.
- `PRESENCE_OFFLINE`: Server broadcast announcing peer departure.
- `CONNECTION_REQUEST`: Client initiating connection to a target peer.
- `CONNECTION_INCOMING`: Server alerting target peer of incoming request.
- `CONNECTION_ACCEPT`: Target peer accepting connection request.
- `CONNECTION_REJECT`: Target peer rejecting connection request.
- `PAIRING_START`: Server transmitting 6-digit code and pairing challenge.
- `PAIRING_CONFIRM`: Client submitting signature proof of code verification.
- `SIGNAL_OFFER`: SDP Offer payload forwarded between authorized peers.
- `SIGNAL_ANSWER`: SDP Answer payload forwarded between authorized peers.
- `SIGNAL_ICE`: ICE candidate payload forwarded between authorized peers.

---

## 22. Realtime Protocol

### 22.1 WebRTC DataChannel Specification
- **Channel Label:** `whispermesh-data`
- **Channel Options:**
  - `ordered`: `true`
  - `maxRetransmits`: `null` (Reliable mode enforced by SCTP)
- **Serialization Format:** Compact MessagePack binary serialization for minimal payload overhead.

### 22.2 Wire Protocol Message Format

```
+-------------------------------------------------------------------+
| Field Name      | Type     | Size     | Description               |
+-------------------------------------------------------------------+
| magic_byte      | uint8    | 1 byte   | 0x57 (Protocol Identifier)|
| version         | uint8    | 1 byte   | 0x01 (Protocol Version)   |
| msg_type        | uint8    | 1 byte   | Opcode (e.g., 0x10 = TEXT)|
| flags           | uint8    | 1 byte   | Bitmask flags             |
| session_id      | uuid     | 16 bytes | Raw binary UUID           |
| message_id      | uuid     | 16 bytes | Raw binary UUID           |
| timestamp       | uint64   | 8 bytes  | Unix epoch (milliseconds) |
| payload_length  | uint32   | 4 bytes  | Length of content payload |
| payload         | bytes    | Variable | UTF-8 or raw payload      |
| signature       | bytes    | 64 bytes | Ed25519 digital signature |
+-------------------------------------------------------------------+
```

### 22.3 Opcode Catalog

| Opcode | Name | Description |
| :--- | :--- | :--- |
| `0x01` | `PING` | In-channel latency check |
| `0x02` | `PONG` | In-channel latency response |
| `0x10` | `TEXT` | UTF-8 chat message |
| `0x11` | `ACK` | Transport acknowledgment |
| `0x12` | `DELIVERED` | Application-level receipt confirmation |
| `0x20` | `TYPING` | Peer typing state toggle |
| `0x30` | `DISCONNECT` | Graceful in-channel session termination |

---

## 23. Performance Requirements

### 23.1 Engineering Targets vs. Real-World Constraints

| Metric | Engineering Design Target | Real-World Expectation (Variable Network Conditions) | Influencing Factors |
| :--- | :--- | :--- | :--- |
| **Cold Startup to Interactive** | ≤ 1,200 ms (Desktop)<br>≤ 1,800 ms (Mobile) | ≤ 2,500 ms | Local disk I/O, OS background scheduling, secure enclave read delays. |
| **WebSocket Connection & Auth** | ≤ 200 ms | 300 ms – 1,200 ms | Cellular connection setup, TLS handshake RTT, geographic distance to gateway. |
| **Presence Update Delivery** | ≤ 100 ms (Server egress) | 250 ms – 800 ms | Subscriber fan-out size, mobile carrier latency spikes. |
| **Pairing Code Verification** | ≤ 150 ms | 300 ms – 600 ms | Server-side signature validation, client UI confirmation latency. |
| **P2P ICE Negotiation (Direct)** | ≤ 800 ms | 1,000 ms – 3,000 ms | Number of local network adapters, STUN binding discovery time. |
| **TURN Fallback Establishment** | ≤ 1,500 ms | 2,000 ms – 5,000 ms | Symmetric NAT timeout heuristics before ICE falls back to relay. |
| **Text Message E2E Delivery** | ≤ 50 ms + Physical RTT | 80 ms – 400 ms | Direct P2P routing efficiency, radio bufferbloat on 4G/5G mobile links. |
| **UI Render Frame Rate** | Constant 60 fps | 60 fps (≥ 55 fps min) | Native OS rendering, avoidance of heavy DOM/Webview reflows. |

---

## 24. Reliability Requirements
- **Graceful Network Degradation:** If network connectivity drops, the client must immediately transition to an offline state, queue zero outbound messages, and suppress user sending actions until connectivity is re-established.
- **Automatic ICE Restart:** If an established WebRTC DataChannel experiences network disconnection (e.g., peer switches from Wi-Fi to cellular data), the client must trigger an ICE restart via signaling within 2 seconds.
- **Session Cleanup Invariants:** Disconnection of either party must reliably release all allocated WebRTC ports, close the DataChannel, and wipe active session buffers to prevent memory leaks.

---

## 25. Infrastructure Requirements

### 25.1 Minimum Viable Deployment Topology
- **1x Ingress / Load Balancer:** NGINX or HAProxy handling TLS termination (`wss://` and `https://`) and routing to application nodes.
- **2x Fastify Signaling Nodes:** Node.js runtime instances (2 vCPU, 4 GB RAM each) running stateless application servers.
- **1x Redis Sentinel / Cluster:** Primary-replica setup (2 GB RAM) for presence cache, TTL management, and Pub/Sub routing.
- **1x PostgreSQL Instance:** Managed db (1 vCPU, 2 GB RAM) for persistent metadata, configuration, and audit access logs.
- **1x coturn Instance:** Co-located on high-bandwidth public compute node with public static IPv4/IPv6, running STUN (UDP 3478) and TURN (UDP/TCP 3478, TLS 5349).

---

## 26. Cost Considerations

### 26.1 Bandwidth-First Cost Optimization
- **P2P Minimization of Relay Costs:** Direct WebRTC P2P offloads 100% of chat message traffic from cloud servers. TURN relays incur direct egress bandwidth costs; therefore, the ICE configuration must strictly prioritize direct host and server reflexive candidates over relay candidates.
- **Lightweight Ephemeral Footprint:** Because messages are never stored centrally, database storage costs remain near zero regardless of message volume.
- **Estimated MVP Monthly Operating Cost (Low-Scale: ~5,000 MAU):**
  - Compute (Signaling & Presence): $40 / month
  - Managed Redis & DB: $30 / month
  - TURN Relay Server (1 TB Egress allowance): $20 / month
  - Domain, Certificates, DNS: $10 / month
  - **Total Estimated Run-Rate:** ~$100 / month

---

## 27. Distribution Strategy
- **macOS:** Downloadable `.dmg` bundle containing a universal binary (Apple Silicon + Intel). Binaries signed with Apple Developer ID and notarized via Apple Notary Service to prevent Gatekeeper warnings.
- **Windows:** Downloadable `.msi` and executable installer built via WiX/NSIS. Binaries signed with an EV Code Signing Certificate to eliminate Microsoft Defender SmartScreen friction.
- **Android:** Direct release APK download hosted on GitHub Releases / official site, built for `arm64-v8a` and `armeabi-v7a`.
- **iOS:** Distributed via Apple TestFlight public link or ad-hoc enterprise signing during early testing stages.
- **Update Mechanism:** Desktop builds bundle an integrated auto-updater check (Tauri Updater) querying signed GitHub release manifests for non-intrusive in-app update notifications.

---

## 28. MVP Scope
- Full cross-platform client support: macOS, Windows, Android, and iOS.
- Local cryptographic device identity generation (Ed25519 / X25519) and secure enclave key persistence.
- Ephemeral global presence service (Available, Connecting, Connected, Offline) via WebSocket heartbeats.
- Available peers directory view with real-time updates.
- 1-to-1 Connection request flow (Initiate, Accept, Reject, Timeout).
- 6-digit numeric short-lived pairing-code generation and verification.
- WebRTC signaling coordination (Offer, Answer, ICE candidates).
- Hybrid transport: STUN direct P2P connectivity with automatic coturn TURN relay fallback.
- Bidirectional encrypted real-time text chat across WebRTC DataChannels.
- Automatic session teardown and memory purging upon disconnect.
- Automated client presence recovery upon network restoration.

---

## 29. V1.1 Scope
- Linux desktop client distribution (`.AppImage`, `.deb`).
- QR-code pairing flow for seamless camera-based Mobile-to-Desktop pairing.
- Local persistent encrypted message history (encrypted with local device key; never sent to server).
- In-channel typing indicators and read receipts.
- Direct peer-to-peer file transfer (small documents and images under 25 MB).
- Presence privacy controls (e.g., "Invisible" mode, custom status messages).

---

## 30. Future Scope
- Peer-to-peer voice calling (Opus codec via WebRTC MediaStreams).
- Low-latency peer-to-peer video communication.
- Multi-peer encrypted group mesh channels (decentralized small groups up to 4 participants).
- Multi-device cryptographic identity synchronization (pairing multiple devices to one logical identity).
- Chunked, resumed high-throughput file transfers over DataChannels.

---

## 31. Success Metrics
- **P2P Establishment Ratio:** ≥ 85% of successful connections establish direct P2P connections without requiring TURN relay fallback.
- **Connection Success Rate:** ≥ 99.0% of accepted connection requests successfully establish an active DataChannel.
- **Signaling Latency:** 95% of connection requests delivered to target peer within ≤ 250 ms.
- **Pairing Success Rate:** ≥ 98% of accepted requests successfully complete pairing-code verification on first attempt.
- **Crash-Free Sessions:** ≥ 99.8% crash-free user sessions across all four target operating systems.

---

## 32. Acceptance Criteria
- [ ] Client builds cleanly and runs natively on macOS (Apple Silicon & Intel), Windows 10/11, Android 9+, and iOS 15+.
- [ ] Upon first launch, client generates valid Ed25519/X25519 keypairs and persists private keys strictly within native secure storage.
- [ ] User can enter a display name and immediately appears in the global directory on other clients connected to distinct networks.
- [ ] Presence transitions between Available, Connecting, Connected, and Offline update across all connected clients within ≤ 500 ms.
- [ ] Two devices located on different external networks (e.g., cellular data vs. home broadband) can initiate, accept, and verify a connection request.
- [ ] A 6-digit pairing code is displayed on both devices; entering or confirming the code allows signaling to proceed, while mismatch or expiration blocks connection.
- [ ] In standard home/office network topologies, WebRTC DataChannel connects directly peer-to-peer.
- [ ] Under simulated Symmetric NAT conditions (forced direct connection failure), connection successfully falls back to TURN relay.
- [ ] Users can exchange real-time text messages with bidirectional delivery acknowledgments.
- [ ] Closing the session or terminating the application completely flushes the chat transcript from device memory.
- [ ] Inspecting server network traffic and logs confirms that zero message text or private cryptographic keys ever traverse or persist on the central server.

---

## 33. Risks
- **Aggressive Mobile OS Background Process Killing:** Both iOS and Android terminate background WebSocket connections aggressively, resulting in false offline presence states.
- **Symmetric NAT Traversal Cost Spikes:** If a disproportionate percentage of users are located behind restrictive corporate firewalls or CGNAT, TURN relay bandwidth costs could escalate rapidly.
- **Desktop Antivirus & Firewall False Positives:** Local P2P UDP hole-punching behavior may trigger heuristic alerts on aggressive third-party Windows antivirus software.
- **Pairing Code Race Conditions:** High network latency could cause pairing codes to expire while users are actively confirming them.

---

## 34. Technical Constraints
- **Zero Third-Party Account Infrastructure:** System must not depend on external identity providers (Google, Apple, OAuth, phone SMS gateways).
- **Webview WebRTC Implementation Discrepancies:** Different underlying Webview engines on Windows (WebView2 / Chromium) versus macOS (WKWebView / WebKit) have subtle variations in WebRTC ICE candidate gathering that must be normalized in client code.
- **Memory Footprint Limitations:** Client UI must remain responsive and lightweight, strictly avoiding heavy web frameworks or unoptimized bundle sizes.

---

## 35. Open Questions
- **Pairing Code Verification Action:** Should the pairing step require active manual re-entry of the 6 digits on one of the devices, or is mutual binary confirmation ("Do you see code 123 456?") sufficient for MVP usability? *(Current spec defaults to visual match + confirmation button to optimize mobile speed).*
- **TURN Relay Egress Limits:** Should individual sessions routed through TURN relay be subject to a maximum continuous session duration (e.g., 2 hours) or data limit to protect infrastructure budgets?
- **Public Directory Scaling:** When active concurrent users exceed 1,000, should the global presence list transition from a single unpaginated directory to interest-based clusters, active room tags, or paginated search to conserve bandwidth?

---

## 36. Development Phases

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Core Networking & Crypto Proof-of-Concept                     │
│ Duration: Weeks 1–3                                                    │
│ Deliverables:                                                          │
│ - Node.js/Fastify signaling & presence server with Redis backend       │
│ - coturn STUN/TURN deployment                                          │
│ - Rust/Node prototypes validating cross-network WebRTC DataChannel     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Desktop Client Implementation (Tauri 2 + React)               │
│ Duration: Weeks 4–7                                                    │
│ Deliverables:                                                          │
│ - Rust core: Key generation, OS keychain integration, Tauri IPC        │
│ - React UI: Presence list, connection modal, pairing screen, chat view │
│ - macOS & Windows end-to-end P2P chat verification                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Mobile Client Implementation (React Native)                   │
│ Duration: Weeks 8–11                                                   │
│ Deliverables:                                                          │
│ - Android Keystore & iOS Keychain native modules                       │
│ - WebRTC integration via react-native-webrtc                           │
│ - Complete mobile UI views matching desktop wire protocol              │
│ - Cross-platform testing (Desktop-to-Mobile, Mobile-to-Mobile)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Hardening, Security Validation & Release Packaging            │
│ Duration: Weeks 12–14                                                  │
│ Deliverables:                                                          │
│ - Security audit of pairing handshake and signaling token validation   │
│ - NAT traversal stress testing across cellular carriers & public Wi-Fi │
│ - macOS code signing & Apple notarization                              │
│ - Windows EV code signing & installer packaging                        │
│ - Android release APK builds & iOS TestFlight distribution             │
└────────────────────────────────────────────────────────────────────────┘
```
