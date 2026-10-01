use whispermesh_core::{CryptoEngine, IdentityKeys};

fn main() {
    println!("=== WhisperMesh Rust Native Core Engine ===");
    let identity: IdentityKeys = CryptoEngine::generate_identity(uuid::Uuid::new_v4().to_string());
    println!("Generated Hardware-backed Identity: {}", identity.device_id);
    println!("Public Key (Ed25519): {}", identity.public_key_ed25519);
}
