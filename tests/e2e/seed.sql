-- E2E test accounts on the LOCAL dev server (never prod). Run before every
-- e2e run by tests/e2e/globalSetup.ts, so a dev database restored from a
-- backup heals itself: missing accounts are created, passwords reset to
-- testpass123 (the password the server's tests/collaboration scripts use).
-- The harness wipes everything these accounts own, so no other test or
-- person may use them.
INSERT INTO users (email, password, firstname, lastname, hash, active, deleted)
SELECT v.email, crypt('testpass123', gen_salt('bf')), v.firstname, v.lastname, md5(random()::text), true, false
FROM (VALUES
  ('e2e.ana@test.strabospot.org',  'Ana',  'Ruiz'),
  ('e2e.ben@test.strabospot.org',  'Ben',  'Ito'),
  ('e2e.cleo@test.strabospot.org', 'Cleo', 'Park'),
  ('e2e.dev@test.strabospot.org',  'Dev',  'Shah')
) AS v(email, firstname, lastname)
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email);

UPDATE users SET password = crypt('testpass123', gen_salt('bf')), active = true, deleted = false
WHERE email LIKE 'e2e.%@test.strabospot.org';

SELECT email || ' ' || pkey FROM users WHERE email LIKE 'e2e.%@test.strabospot.org' ORDER BY email;
