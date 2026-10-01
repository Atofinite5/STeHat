//! embedded_gateway.rs - In-memory embedded local discovery & signaling daemon
//! Runs directly inside WhisperMesh on port 4000.
//! Implements local Wi-Fi / Hotspot mesh presence, heartbeat, and pairing handshakes.
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use futures_util::{StreamExt, SinkExt};

type PeersMap = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;
type PresenceRegistry = Arc<RwLock<HashMap<String, serde_json::Value>>>;

pub fn spawn_embedded_gateway_if_needed(port: u16) {
    tokio::spawn(async move {
        let addr: std::net::SocketAddr = ([0, 0, 0, 0], port).into();
        
        let peers: PeersMap = Arc::new(RwLock::new(HashMap::new()));
        let registry: PresenceRegistry = Arc::new(RwLock::new(HashMap::new()));

        let peers_filter = warp::any().map(move || peers.clone());
        let registry_filter = warp::any().map(move || registry.clone());

        let ws_route = warp::path("v1")
            .and(warp::path("gateway"))
            .and(warp::ws())
            .and(peers_filter)
            .and(registry_filter)
            .map(|ws: warp::ws::Ws, p: PeersMap, r: PresenceRegistry| {
                ws.on_upgrade(move |socket| handle_connection(socket, p, r))
            });

        let routes = ws_route.with(warp::cors().allow_any_origin());

        println!("[EmbeddedGateway] Wi-Fi Mesh Broker listening on ws://0.0.0.0:{}", port);
        warp::serve(routes).run(addr).await;
    });
}

async fn handle_connection(ws: WebSocket, peers: PeersMap, registry: PresenceRegistry) {
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    let conn_id = uuid::Uuid::new_v4().to_string();

    tokio::task::spawn(async move {
        while let Some(message) = rx.recv().await {
            let _ = user_ws_tx.send(message).await;
        }
    });

    peers.write().await.insert(conn_id.clone(), tx.clone());

    // Send initial snapshot of all devices on this Wi-Fi
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

                                // Broadcast updated presence snapshot to everyone on Wi-Fi
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
                        "CONNECTION_REQUEST" => {
                            let forward = serde_json::json!({
                                "type": "INCOMING_REQUEST",
                                "payload": payload
                            });
                            broadcast_to_all_except(&peers, &conn_id, Message::text(forward.to_string())).await;
                        }
                        "CONNECTION_ACCEPT" => {
                            let auth = serde_json::json!({
                                "type": "SIGNALING_AUTHORIZED",
                                "payload": {
                                    "sessionId": payload.get("sessionId").unwrap_or(&serde_json::json!("default")),
                                    "targetDeviceId": payload.get("targetDeviceId").unwrap_or(&serde_json::json!("")),
                                    "authorized": true,
                                    "iceServers": [
                                        { "urls": "stun:stun.l.google.com:19302" }
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

    // Cleanup on disconnect: remove device immediately so other peers see offline
    peers.write().await.remove(&conn_id);
    if let Some(dev_id) = registered_device_id {
        registry.write().await.remove(&dev_id);
        broadcast_snapshot(&peers, &registry).await;
    }
}

fn chrono_now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
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
