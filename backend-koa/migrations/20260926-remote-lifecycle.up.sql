-- Apply once after the login-session and remote-control migrations; additive only.
ALTER TABLE remote_sessions
  ADD COLUMN requestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN requestHash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN controllerEndpointId VARCHAR(128) NULL,
  ADD COLUMN grantCreatedBySid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE INDEX remote_request_idempotency (controllerSid, requestId),
  ADD INDEX remote_history_reconcile (state, createdAt, sessionId),
  ADD INDEX remote_history_retention (state, updatedAt, sessionId),
  ADD INDEX remote_history_grant_creator (grantCreatedBySid);
CREATE TABLE IF NOT EXISTS remote_session_events (
  sessionId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  eventSeq INT NOT NULL,
  eventType VARCHAR(24) NOT NULL,
  reason VARCHAR(64) NULL,
  occurredAt DATETIME NULL,
  observedAt DATETIME NOT NULL,
  PRIMARY KEY (sessionId, eventSeq),
  INDEX remote_event_observed (observedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
