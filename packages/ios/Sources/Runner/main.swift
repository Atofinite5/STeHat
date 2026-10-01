import Foundation
import WhisperMeshCore

@main
struct WhisperMeshRunner {
    static func main() {
        print("=== Testing WhisperMesh Swift Core Engine ===")
        let identity = SwiftIdentity(deviceId: "apple-dev-runner-01")
        print("Generated Device ID: \(identity.deviceId)")
        print("Public Key (Ed25519): \(identity.publicKeyEd25519)")

        let challenge = "WHISPERMESH_PAIRING_v1:session-apple:123456".data(using: .utf8)!
        do {
            let signature = try identity.sign(message: challenge)
            print("Generated Ed25519 Signature: \(signature)")

            let isValid = SwiftIdentity.verify(
                publicKeyBase64: identity.publicKeyEd25519,
                message: challenge,
                signatureBase64: signature
            )
            print("Signature Verification Result: \(isValid ? "PASSED (100% OK)" : "FAILED")")
            if !isValid {
                exit(1)
            }
        } catch {
            print("Execution failed with error: \(error)")
            exit(1)
        }
    }
}
