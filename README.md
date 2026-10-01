# WhisperMesh

> **Cross-Platform, Privacy-Focused, Low-Latency Peer-to-Peer Presence and Chat Application**

WhisperMesh enables users anywhere in the world—across disparate ISPs, mobile networks, Wi-Fi setups, and devices—to discover one another through an ephemeral global presence space, verify mutual identity with single-use pairing codes, and chat in real time over end-to-end encrypted WebRTC DataChannels with zero server message persistence.

---

## Documentation Quick Links
- **[Product Requirements Document (PRD)](file:///Users/bhargavkalambhe/Desktop/stehat/PRD.md)**: Full product vision, user flows, architecture, security model, and acceptance criteria.
- **[Engineering Execution Plan](file:///Users/bhargavkalambhe/Desktop/stehat/EXECUTION_PLAN.md)**: Milestone breakdown, monorepo architecture, and engineering tasks.
- **[Project Log & Status](file:///Users/bhargavkalambhe/Desktop/stehat/PROJECT_LOG.md)**: Live tracking log of updates, sprint progress, and task statuses.

---

## Core Architecture Highlights
- **Client Platforms:** macOS, Windows (Tauri 2 + Rust + React), Android, iOS (React Native).
- **Security & Privacy:** Local Ed25519 & X25519 keypairs stored in native secure enclaves (Keychain / Credential Manager / Keystore). Private keys never leave the device.
- **Control Plane:** Ephemeral WebSocket signaling service (Node.js/Fastify + Redis). Heartbeats every 15s; automatic 30s offline expiration.
- **Data Plane:** WebRTC DataChannels (`whispermesh-data`). Direct P2P via STUN, automatic TURN relay fallback when firewalls or Symmetric NATs prevent direct connections. Zero server-side message storage.
- **Pairing Flow:** 6-digit random, single-use, rate-limited verification code with 60-second TTL to eliminate MITM attacks.

---

## Supported Operating Systems
| Platform | Client Technology | Packaging |
| :--- | :--- | :--- |
| **macOS** | Tauri 2 (Rust Core + React) | Signed `.dmg` / Universal Binary |
| **Windows** | Tauri 2 (Rust Core + React) | Signed `.msi` / NSIS |
| **Android** | React Native (TS + Native Modules) | Release `.apk` |
| **iOS** | React Native (TS + Native Modules) | TestFlight / `.ipa` |
