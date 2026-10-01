# WhisperMesh — Engineering Execution Plan

## 1. Executive Summary
This document outlines the concrete technical execution roadmap, module architecture, repository layout, and task breakdown for building **WhisperMesh** according to the [PRD](file:///Users/bhargavkalambhe/Desktop/stehat/PRD.md).

---

## 2. Repository Layout & Target Monorepo Structure

```
stehat/
├── PRD.md                         # Product Requirements Document
├── EXECUTION_PLAN.md              # Engineering Execution Roadmap & Task Breakdown
├── PROJECT_LOG.md                 # Real-time Project Log & Progress Changelog
├── README.md                      # Project Overview and Quickstart Guide
├── packages/
│   ├── protocol/                  # Shared Wire Protocol & Types (TypeScript & Rust)
│   │   ├── src/
│   │   │   ├── types.ts           # Message definitions (TEXT, ACK, PING, OFFER, etc.)
│   │   │   ├── codec.ts           # MessagePack serializer/deserializer
│   │   │   └── crypto.ts          # Common cryptographic wrappers
│   │   └── package.json
│   ├── server/                    # Signaling & Presence Server (Fastify + Redis)
│   │   ├── src/
│   │   │   ├── gateway/           # WebSocket gateway handler
│   │   │   ├── presence/          # Redis-backed ephemeral presence controller
│   │   │   ├── pairing/           # Pairing-code generator & signature verifier
│   │   │   ├── signaling/         # WebRTC SDP & ICE candidate router
│   │   │   └── index.ts           # Server entrypoint
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── desktop/                   # Desktop Application (Tauri 2 + React + Rust)
│   │   ├── src-tauri/             # Native Rust Core
│   │   │   ├── src/
│   │   │   │   ├── crypto.rs      # Ed25519 & X25519 key generation via Rust
│   │   │   │   ├── storage.rs     # OS Keychain / Credential Manager storage
│   │   │   │   └── main.rs        # Tauri IPC commands & entrypoint
│   │   │   └── Cargo.toml
│   │   ├── src/                   # React + TypeScript Frontend
│   │   │   ├── components/        # Presence list, modals, chat window
│   │   │   ├── hooks/             # useWebRTC, usePresence, usePairing
│   │   │   └── App.tsx
│   │   └── package.json
│   └── mobile/                    # Mobile Application (React Native)
│       ├── src/
│       │   ├── components/        # Mobile views matching desktop UX
│       │   ├── native/            # Keychain/Keystore native bindings
│       │   └── hooks/             # Shared state & WebRTC hooks
│       └── package.json
└── infrastructure/
    ├── docker-compose.yml         # Local stack (Fastify, Redis, Postgres, coturn)
    └── coturn/
        └── turnserver.conf        # STUN/TURN configuration
```

---

## 3. Work Breakdown Structure (WBS) & Milestones

### Milestone 1: Shared Protocol & Infrastructure Baseline
- [ ] **M1.1 — Protocol Definition:**
  - Define binary MessagePack schemas and TypeScript interfaces for all opcodes:
    `PING`, `PONG`, `TEXT`, `ACK`, `DELIVERED`, `TYPING`, `DISCONNECT`, `CONNECTION_REQUEST`, `CONNECTION_ACCEPT`, `CONNECTION_REJECT`, `OFFER`, `ANSWER`, `ICE_CANDIDATE`.
  - Implement serialization, deserialization, and signature validation functions.
- [ ] **M1.2 — Local Infrastructure & Containers:**
  - Create `docker-compose.yml` defining Redis, PostgreSQL, and coturn STUN/TURN server.
  - Configure `turnserver.conf` with long-term credential mechanism and UDP/TCP ports.

### Milestone 2: Fastify Signaling & Ephemeral Presence Engine
- [ ] **M2.1 — WebSocket Gateway & Connection Lifecycle:**
  - Setup Fastify with `@fastify/websocket`.
  - Handle client connection, authentication challenge, and disconnection events.
- [ ] **M2.2 — Ephemeral Presence (Redis):**
  - Implement `PRESENCE_REGISTER` and `PRESENCE_HEARTBEAT` (15s interval, 30s TTL).
  - Implement Redis key expiration hooks and broadcast `PRESENCE_UPDATE` and `PRESENCE_OFFLINE` to all connected peers.
  - Implement `GET /v1/presence/snapshot` to fetch active peers upon initial connection.
- [ ] **M2.3 — Pairing Engine & Code Verification:**
  - Implement 6-digit random code generation with CSPRNG.
  - Enforce 60-second TTL in Redis and max 3-attempt rate limiting.
  - Verify Ed25519 digital signatures of the pairing challenge before issuing ephemeral signaling tokens.
- [ ] **M2.4 — WebRTC Signaling Router:**
  - Route `OFFER`, `ANSWER`, and `ICE_CANDIDATE` messages strictly between mutually verified pairs.

### Milestone 3: Desktop Client (Tauri 2 + Rust + React)
- [ ] **M3.1 — Tauri 2 Project Scaffold & Rust Cryptography:**
  - Scaffold Tauri 2 with React + TypeScript.
  - Implement Rust module for generating Ed25519/X25519 keypairs and persisting private keys in macOS Keychain and Windows Credential Manager.
  - Expose IPC commands: `get_or_create_identity`, `sign_pairing_challenge`.
- [ ] **M3.2 — WebRTC DataChannel Integration:**
  - Implement `WebRTCService` managing `RTCPeerConnection`, STUN/TURN configurations, and `RTCDataChannel` (`whispermesh-data`).
  - Implement hybrid connection strategy: attempt direct host/srflx candidates, fallback to TURN relay.
- [ ] **M3.3 — Desktop UI Implementation:**
  - Welcome / Onboarding modal (Display Name input).
  - Main Dashboard (Current status badge, Available users list with platform icons).
  - Connection Request modal & 6-digit pairing code verification view.
  - Active Chat view with real-time delivery ticks, connection type indicator (`Direct P2P` vs `TURN Relayed`), and Disconnect action.

### Milestone 4: Mobile Client (React Native)
- [ ] **M4.1 — React Native Setup & Native Security:**
  - Scaffold React Native application targeting iOS and Android.
  - Implement native secure storage modules (Android Keystore, iOS Keychain).
- [ ] **M4.2 — Native WebRTC Integration:**
  - Integrate `react-native-webrtc` and bind shared protocol codecs.
  - Implement background/foreground connection resilience and socket wakeups.
- [ ] **M4.3 — Mobile UI Parity:**
  - Build responsive mobile screens mirroring desktop UX and interaction flows.

### Milestone 5: Cross-Network E2E Testing, Hardening & Packaging
- [ ] **M5.1 — Cross-Network Validation:**
  - Verify peer-to-peer connectivity across distinct external networks (Cellular vs. Home Wi-Fi).
  - Validate TURN fallback under simulated Symmetric NAT restrictions.
- [ ] **M5.2 — Security & Leak Testing:**
  - Verify zero plaintext leaks on signaling server and coturn relay logs.
  - Verify in-memory message history wipe upon session teardown.
- [ ] **M5.3 — Build & Distribution:**
  - Configure GitHub Actions for building signed macOS `.dmg` and Windows `.msi`.
  - Generate release Android `.apk` and iOS TestFlight bundle.

---

## 4. Immediate Next Execution Steps
1. Initialize repository workspace configuration and core documentation.
2. Build `packages/protocol` containing the shared message types, opcodes, and serialization code.
3. Scaffold `packages/server` with Fastify, WebSocket gateway, Redis presence store, and coturn orchestration.
4. Scaffold `packages/desktop` using Tauri 2 + Rust + React.
