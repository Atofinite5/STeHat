import Foundation
import CryptoKit

/// Hardware-backed cryptographic identity for Apple platforms using CryptoKit.
public struct SwiftIdentity: Sendable {
    public let deviceId: String
    public let publicKeyEd25519: String
    private let privateKey: Curve25519.Signing.PrivateKey

    public init(deviceId: String = UUID().uuidString) {
        self.deviceId = deviceId
        let key = Curve25519.Signing.PrivateKey()
        self.privateKey = key
        self.publicKeyEd25519 = key.publicKey.rawRepresentation.base64EncodedString()
    }

    /// Signs an arbitrary message using the local Secure Enclave / CryptoKit private key.
    public func sign(message: Data) throws -> String {
        let signature = try privateKey.signature(for: message)
        return signature.base64EncodedString()
    }

    /// Verifies an Ed25519 signature.
    public static func verify(publicKeyBase64: String, message: Data, signatureBase64: String) -> Bool {
        guard let pkData = Data(base64Encoded: publicKeyBase64),
              let sigData = Data(base64Encoded: signatureBase64),
              let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: pkData) else {
            return false
        }
        return publicKey.isValidSignature(sigData, for: message)
    }
}
