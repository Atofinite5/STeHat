//! embedded_gateway.rs - In-memory embedded local discovery & signaling daemon
//! Runs directly inside WhisperMesh on port 4000 if no external gateway is active.
//! Implements Internet AirDrop-style global radar, heartbeats, and pairing handshakes.
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use futures_util::{StreamExt, SinkExt};

type PeersMap = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;
type PresenceRegistry = Arc<RwLock<HashMap<String, serde_json::Value>>>;
type SpaceMembersMap = Arc<RwLock<HashMap<String, Vec<String>>>>; // space_address -> Vec<conn_id>

pub fn spawn_embedded_gateway_if_needed(port: u16) {
    tokio::spawn(async move {
        let addr: std::net::SocketAddr = ([0, 0, 0, 0], port).into();
        
        let peers: PeersMap = Arc::new(RwLock::new(HashMap::new()));
        let registry: PresenceRegistry = Arc::new(RwLock::new(HashMap::new()));
        let spaces: SpaceMembersMap = Arc::new(RwLock::new(HashMap::new()));

        let peers_filter = warp::any().map(move || peers.clone());
        let registry_filter = warp::any().map(move || registry.clone());
        let spaces_filter = warp::any().map(move || spaces.clone());

        let ws_route = warp::path("v1")
            .and(warp::path("gateway"))
            .and(warp::ws())
            .and(peers_filter)
            .and(registry_filter)
            .and(spaces_filter)
            .map(|ws: warp::ws::Ws, p: PeersMap, r: PresenceRegistry, s: SpaceMembersMap| {
                ws.on_upgrade(move |socket| handle_connection(socket, p, r, s))
            });

        let routes = ws_route.with(warp::cors().allow_any_origin());

        println!("[EmbeddedGateway] Global Radar Space Broker listening on ws://0.0.0.0:{}", port);
        warp::serve(routes).run(addr).await;
    });
}

async fn handle_connection(ws: WebSocket, peers: PeersMap, registry: PresenceRegistry, spaces: SpaceMembersMap) {
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let conn_id = uuid::Uuid::new_v4().to_string();

    tokio::task::spawn(async move {
        while let Some(message) = rx.recv().await {
            let _ = user_ws_tx.send(message).await;
        }
    });

    peers.write().await.insert(conn_id.clone(), tx.clone());

    // Send initial snapshot
    {
        let reg = registry.read().await;
        let peers_list: Vec<serde_json::Value> = reg.values().cloned().collect();
        let snapshot = serde_json::json!({
            "type": "PRESENCE_SNAPSHOT",
            "payload": {
                "peers": peers_list
            }
        });
        let _ = tx.send(Message::text(snapshot.to_string()));
    }

    let mut registered_device_id: Option<String> = None;
    let mut current_space: Option<String> = None;

    while let Some(result) = user_ws_rx.next().await {
        if let Ok(msg) = result {
            if let Ok(text) = msg.to_str() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                    let msg_type = json.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    let payload = json.get("payload").cloned().unwrap_or(serde_json::Value::Null);

                    match msg_type {
                        "PRESENCE_REGISTER" => {
                            if let Some(dev_id) = payload.get("deviceId").and_then(|d| d.as_str()) {
                                registered_device_id = Some(dev_id.to_string());
                                registry.write().await.insert(dev_id.to_string(), payload.clone());

                                // Broadcast updated presence snapshot to all peers
                                broadcast_snapshot(&peers, &registry).await;
                            }
                        }
                        "PRESENCE_HEARTBEAT" => {
                            if let Some(ref dev_id) = registered_device_id {
                                let mut reg = registry.write().await;
                                if let Some(peer_val) = reg.get_mut(dev_id) {
                                    if let Some(obj) = peer_val.as_object_mut() {
                                        obj.insert("lastSeenTimestamp".to_string(), serde_json::json!(chrono_now_ms()));
                                        obj.insert("status".to_string(), serde_json::json!("AVAILABLE"));
                                    }
                                }
                            }
                        }
                        "JOIN_SPACE" => {
                            if let Some(space_address) = payload.get("spaceAddress").and_then(|s| s.as_str()) {
                                current_space = Some(space_address.to_string());
                                let mut sp_map = spaces.write().await;
                                let members = sp_map.entry(space_address.to_string()).or_insert_with(Vec::new);
                                if !members.contains(&conn_id) {
                                    members.push(conn_id.clone());
                                }
                                
                                let ack = serde_json::json!({
                                    "type": "SPACE_JOINED",
                                    "payload": {
                                        "spaceAddress": space_address,
                                        "memberCount": members.len(),
                                        "peersInSpace": members.len()
                                    }
                                });
                                let _ = tx.send(Message::text(ack.to_string()));

                                // Notify other peer in space
                                let notice = serde_json::json!({
                                    "type": "PEER_JOINED_SPACE",
                                    "payload": {
                                        "spaceAddress": space_address,
                                        "connId": conn_id,
                                        "device": payload.get("device").cloned().unwrap_or(serde_json::Value::Null)
                                    }
                                });
                                broadcast_to_space(&peers, &spaces, space_address, &conn_id, Message::text(notice.to_string())).await;
                            }
                        }
                        "SPACE_SIGNAL" => {
                            if let Some(space_address) = payload.get("spaceAddress").and_then(|s| s.as_str()) {
                                let signal = serde_json::json!({
                                    "type": "SPACE_SIGNAL",
                                    "payload": payload
                                });
                                broadcast_to_space(&peers, &spaces, space_address, &conn_id, Message::text(signal.to_string())).await;
                            }
                        }
                        "CONNECTION_REQUEST" => {
                            // Forward connection request directly to target
                            if let Some(target_id) = payload.get("targetDeviceId").and_then(|t| t.as_str()) {
                                let forward = serde_json::json!({
                                    "type": "INCOMING_REQUEST",
                                    "payload": payload
                                });
                                broadcast_to_all_except(&peers, &conn_id, Message::text(forward.to_string())).await;
                            }
                        }
                        "CONNECTION_ACCEPT" => {
                            let auth = serde_json::json!({
                                "type": "SIGNALING_AUTHORIZED",
                                "payload": {
                                    "sessionId": payload.get("sessionId").unwrap_or(&serde_json::json!("default")),
                                    "targetDeviceId": payload.get("targetDeviceId").unwrap_or(&serde_json::json!("")),
                                    "authorized": true,
                                    "iceServers": [
                                        { "urls": "stun:stun.l.google.com:19302" },
                                        { "urls": "stun:stun1.l.google.com:19302" },
                                        { "urls": "stun:stun.cloudflare.com:3478" }
                                    ]
                                }
                            });
                            broadcast_to_all(&peers, Message::text(auth.to_string())).await;
                        }
                        "PAIRING_REJECT" => {
                            let reject = serde_json::json!({
                                "type": "PAIRING_REJECTED",
                                "payload": payload
                            });
                            broadcast_to_all_except(&peers, &conn_id, Message::text(reject.to_string())).await;
                        }
                        "SIGNAL_OFFER" | "SIGNAL_ANSWER" | "SIGNAL_ICE" => {
                            let signal = serde_json::json!({
                                "type": msg_type,
                                "payload": payload
                            });
                            broadcast_to_all_except(&peers, &conn_id, Message::text(signal.to_string())).await;
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Cleanup on disconnect (Instant offline status for AirDrop radar)
    peers.write().await.remove(&conn_id);
    if let Some(dev_id) = registered_device_id {
        registry.write().await.remove(&dev_id);
        broadcast_snapshot(&peers, &registry).await;
    }
    if let Some(sp) = current_space {
        let mut sp_map = spaces.write().await;
        if let Some(members) = sp_map.get_mut(&sp) {
            members.retain(|c| c != &conn_id);
        }
    }
}

fn chrono_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

async fn broadcast_to_space(peers: &PeersMap, spaces: &SpaceMembersMap, space: &str, except_conn: &str, msg: Message) {
    let sp_map = spaces.read().await;
    if let Some(members) = sp_map.get(space) {
        let p_map = peers.read().await;
        for conn_id in members {
            if conn_id != except_conn {
                if let Some(tx) = p_map.get(conn_id) {
                    let _ = tx.send(msg.clone());
                }
            }
        }
    }
}

async fn broadcast_snapshot(peers: &PeersMap, registry: &PresenceRegistry) {
    let reg = registry.read().await;
    let peers_list: Vec<serde_json::Value> = reg.values().cloned().collect();
    let snapshot = serde_json::json!({
        "type": "PRESENCE_SNAPSHOT",
        "payload": {
            "peers": peers_list
        }
    });
    broadcast_to_all(peers, Message::text(snapshot.to_string())).await;
}

async fn broadcast_to_all(peers: &PeersMap, msg: Message) {
    let map = peers.read().await;
    for tx in map.values() {
        let _ = tx.send(msg.clone());
    }
}

async fn broadcast_to_all_except(peers: &PeersMap, except_conn_id: &str, msg: Message) {
    let map = peers.read().await;
    for (id, tx) in map.iter() {
        if id != except_conn_id {
            let _ = tx.send(msg.clone());
        }
    }
}
