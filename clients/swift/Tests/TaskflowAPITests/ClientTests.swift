import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import TaskflowAPI

/// Answers every request with a canned JSON body and remembers what was sent.
final class StubTransport: ClientTransport, @unchecked Sendable {
  let json: String
  var request: HTTPRequest?
  var sentBody: String?

  init(_ json: String) { self.json = json }

  func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (
    HTTPResponse, HTTPBody?
  ) {
    self.request = request
    if let body { sentBody = try await String(collecting: body, upTo: 1 << 20) }
    return (HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]), HTTPBody(json))
  }
}

func client(_ transport: StubTransport) -> Client {
  Client(taskflowServer: URL(string: "https://tasks.example.com")!, transport: transport)
}

@Test func appSignInAsksForARefreshTokenInTheBody() async throws {
  let transport = StubTransport(
    """
    {"success":true,"data":{
      "user":{"id":"u1","email":"sam@example.com","name":"Sam","role":"USER","isActive":true},
      "accessToken":"access","refreshToken":"refresh"}}
    """)
  let output = try await client(transport).postApiV1AuthLogin(
    body: .json(.init(email: "sam@example.com", password: "secret", client: .app, deviceName: "Sam's iPhone")))

  #expect(transport.request?.method == .post)
  #expect(transport.request?.path == "/api/v1/auth/login")
  let sent = try JSONSerialization.jsonObject(with: Data(transport.sentBody!.utf8)) as! [String: String]
  #expect(sent["client"] == "app")
  #expect(sent["deviceName"] == "Sam's iPhone")
  #expect(try output.ok.body.json.data.refreshToken == "refresh")
}

@Test func syncDecodesTheWireFormat() async throws {
  // Shaped like a real GET /sync response: calendar dates as plain strings,
  // timestamps with milliseconds, fractional sort orders and nulls.
  let transport = StubTransport(
    """
    {"success":true,"data":{
      "cursor":"8123","reset":false,"projectIds":["p1"],
      "projects":[],"sections":[],"labels":[],
      "tasks":[{
        "id":"t1","content":"Book the venue","description":null,"projectId":"p1","sectionId":null,
        "parentId":null,"creatorId":"u1","assigneeId":null,"dueDate":"2026-10-05","dueTime":null,
        "deadline":null,"duration":null,"isRecurring":false,"recurrenceRule":null,"priority":2,
        "isCompleted":false,"completedAt":null,"sortOrder":1.5,"version":3,
        "createdAt":"2026-10-01T09:30:00.123Z","updatedAt":"2026-10-02T10:00:00.456Z",
        "labelIds":["l1"],"deletedAt":null}],
      "deleted":{"projects":[],"sections":["s9"],"tasks":[],"labels":[]}}}
    """)
  let output = try await client(transport).getApiV1Sync(query: .init(since: "8000"))

  #expect(transport.request?.path == "/api/v1/sync?since=8000")
  let sync = try output.ok.body.json.data
  #expect(sync.cursor == "8123")
  #expect(sync.deleted.sections == ["s9"])
  let task = try #require(sync.tasks.first)
  #expect(task.dueDate == "2026-10-05")
  #expect(task.sortOrder == 1.5)
  #expect(task.version == 3)
  #expect(task.assigneeId == nil)
  #expect(task.createdAt == Date(timeIntervalSince1970: 1_790_847_000.123))
}
