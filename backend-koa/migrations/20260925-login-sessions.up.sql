-- MySQL 8+. Run explicitly during a maintenance window before enabling new auth code.
-- This migration requires all clients to sign in again; old JWTs have no sid/version.
ALTER TABLE users ADD COLUMN authVersion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
UPDATE users SET authVersion = UUID() WHERE authVersion IS NULL OR authVersion = '';
ALTER TABLE users MODIFY COLUMN authVersion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;

CREATE TABLE login_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  userId INT NOT NULL,
  authVersion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  refreshHash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  expiresAt DATETIME NOT NULL,
  revokedAt DATETIME NULL,
  rotationRequestId VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  rotationInputHash VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  rotationResponse TEXT NULL,
  rotationExpiresAt DATETIME NULL,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  KEY login_sessions_user_active (userId, revokedAt, expiresAt),
  CONSTRAINT login_sessions_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
