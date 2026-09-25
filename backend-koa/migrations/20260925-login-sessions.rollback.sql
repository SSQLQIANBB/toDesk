-- Safety rollback: stop new logins/refresh and disable remote control before running.
-- Retain schema and revocation data. NEVER run the pre-sid auth implementation again:
-- it can accept old null-version JWTs. Roll back only to a build that validates sid.
START TRANSACTION;
UPDATE users SET authVersion = UUID();
UPDATE login_sessions SET revokedAt = COALESCE(revokedAt, NOW()), rotationRequestId = NULL,
  rotationInputHash = NULL, rotationResponse = NULL, rotationExpiresAt = NULL;
COMMIT;
