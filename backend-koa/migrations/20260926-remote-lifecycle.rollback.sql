-- Keep audit and request-id uniqueness when rolling back application code.
-- Disable admission and drain/stop remote runtimes first. Never restore active state from history.
SELECT 'Retain remote_sessions additions and remote_session_events' AS rollback_instruction;
