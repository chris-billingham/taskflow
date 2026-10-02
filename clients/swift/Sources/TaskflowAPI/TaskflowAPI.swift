// The generated `Client`, `Components` and `Operations` are added to this
// module at build time from openapi.json.
import Foundation
import OpenAPIRuntime

extension Client {
  /// A client for a Taskflow server, e.g. `https://tasks.example.com` (the
  /// operations' paths already start with `/api/v1`).
  ///
  /// Use this rather than `init(serverURL:transport:)`: Taskflow's timestamps
  /// carry milliseconds, which the generator's default date format rejects.
  public init(
    taskflowServer server: URL,
    transport: any ClientTransport,
    middlewares: [any ClientMiddleware] = []
  ) {
    self.init(
      serverURL: server,
      configuration: Configuration(dateTranscoder: .iso8601WithFractionalSeconds),
      transport: transport,
      middlewares: middlewares
    )
  }
}
