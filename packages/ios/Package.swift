// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WhisperMeshCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "WhisperMeshCore",
            targets: ["WhisperMeshCore"]
        ),
        .executable(
            name: "whispermesh-swift-runner",
            targets: ["WhisperMeshRunner"]
        )
    ],
    dependencies: [],
    targets: [
        .target(
            name: "WhisperMeshCore",
            dependencies: [],
            path: "Sources/Core"
        ),
        .executableTarget(
            name: "WhisperMeshRunner",
            dependencies: ["WhisperMeshCore"],
            path: "Sources/Runner"
        )
    ]
)
