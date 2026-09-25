-- Apply after 20260925-login-sessions.up.sql. No runtime release flags are enabled by this migration.
CREATE TABLE IF NOT EXISTS remote_devices (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  ownerUserId INT NOT NULL,
  publicKey TEXT NOT NULL,
  fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  keyVersion INT NOT NULL DEFAULT 1,
  alias VARCHAR(80) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  revokedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX remote_device_owner (ownerUserId, revokedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS remote_assistance_grants (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  hostDeviceId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  createdBySid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  controllerUserId INT NOT NULL,
  expiresAt DATETIME NOT NULL,
  revokedAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX remote_grant_controller (controllerUserId, expiresAt),
  INDEX remote_grant_host (hostDeviceId, revokedAt),
  INDEX remote_grant_sid (createdBySid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS remote_sessions (
  sessionId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  controllerUserId INT NOT NULL,
  hostUserId INT NOT NULL,
  controllerSid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hostSid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hostDeviceId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  grantId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope VARCHAR(16) NOT NULL,
  state VARCHAR(24) NOT NULL,
  revision INT NOT NULL,
  endedAt DATETIME NULL,
  endReason VARCHAR(64) NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  INDEX remote_session_controller (controllerUserId, createdAt),
  INDEX remote_session_host (hostUserId, createdAt),
  INDEX remote_session_controller_sid (controllerSid),
  INDEX remote_session_host_sid (hostSid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
