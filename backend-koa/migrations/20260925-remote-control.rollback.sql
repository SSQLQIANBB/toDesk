-- Non-destructive rollback: disable the feature, stop remote runtimes, roll back application code.
-- Keep these three additive tables so device revocations and session audit history are not lost.
-- Do not drop remote_devices / remote_assistance_grants / remote_sessions during a production rollback.
SELECT 'Remote-control data retained; release gates must remain disabled' AS rollback_instruction;
