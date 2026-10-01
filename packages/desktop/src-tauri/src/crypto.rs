//! crypto.rs - High-assurance Ed25519 & X25519 identity generation & signing
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey, Signature};
use rand::rngs::OsRng;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IdentityKeys {
    pub device_id: String,
    pub public_key_ed25519: String,
    #[serde(skip_serializing)]
    pub private_key_seed: Vec<u8>,
}

pub struct CryptoEngine;

impl CryptoEngine {
    /// Generates a new hardware-entropy cryptographic device identity.
    pub fn generate_identity(device_id: String) -> IdentityKeys {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();

        IdentityKeys {
            device_id,
            public_key_ed25519: BASE64.encode(verifying_key.as_bytes()),
            private_key_seed: signing_key.to_bytes().to_vec(),
        }
    }

    /// Signs an arbitrary message using the local private key seed.
    pub fn sign_message(private_seed: &[u8], message: &[u8]) -> Result<String, String> {
        if private_seed.len() != 32 {
            return Err("Invalid private key seed length. Expected 32 bytes.".into());
        }
        let seed: [u8; 32] = private_seed.try_into().map_err(|_| "Failed to cast seed")?;
        let signing_key = SigningKey::from_bytes(&seed);
        let signature: Signature = signing_key.sign(message);
        Ok(BASE64.encode(signature.to_bytes()))
    }

    /// Verifies an Ed25519 signature against a public key.
    pub fn verify_signature(public_key_b64: &str, message: &[u8], signature_b64: &str) -> bool {
        let pk_bytes = match BASE64.decode(public_key_b64) {
            Ok(b) if b.len() == 32 => b,
            _ => return false,
        };
        let sig_bytes = match BASE64.decode(signature_b64) {
            Ok(b) if b.len() == 64 => b,
            _ => return false,
        };

        let verifying_key = match VerifyingKey::from_bytes(pk_bytes.as_slice().try_into().unwrap()) {
            Ok(k) => k,
            Err(_) => return false,
        };

        let signature = match Signature::from_slice(&sig_bytes) {
            Ok(s) => s,
            Err(_) => return false,
        };

        verifying_key.verify(message, &signature).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_generation_and_signature_roundtrip() {
        let identity = CryptoEngine::generate_identity("test-dev-01".into());
        assert_eq!(identity.device_id, "test-dev-01");
        assert!(!identity.public_key_ed25519.is_empty());

        let challenge = b"WHISPERMESH_PAIRING_v1:session-42:849201";
        let sig_b64 = CryptoEngine::sign_message(&identity.private_key_seed, challenge).unwrap();
        assert!(!sig_b64.is_empty());

        let is_valid = CryptoEngine::verify_signature(&identity.public_key_ed25519, challenge, &sig_b64);
        assert!(is_valid);
    }
}
