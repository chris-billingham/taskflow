// swift-tools-version: 6.0
// The Taskflow API client for Swift, generated at build time from the
// repository's openapi.json by Apple's swift-openapi-generator. CI builds it
// on every change, so an API change the iOS app can't compile against fails
// there first. Apps add a transport, e.g. OpenAPIURLSession.
import PackageDescription

let package = Package(
  name: "TaskflowAPI",
  platforms: [.macOS(.v14), .iOS(.v17)],
  products: [.library(name: "TaskflowAPI", targets: ["TaskflowAPI"])],
  dependencies: [
    .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.0.0"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.0.0"),
    .package(url: "https://github.com/apple/swift-http-types", from: "1.0.0"),
  ],
  targets: [
    .target(
      name: "TaskflowAPI",
      dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
      plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
    ),
    .testTarget(
      name: "TaskflowAPITests",
      dependencies: [
        "TaskflowAPI",
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "HTTPTypes", package: "swift-http-types"),
      ]
    ),
  ]
)
