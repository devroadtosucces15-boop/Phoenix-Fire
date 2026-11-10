-- Discord role mappings for the home server, so the Worker no longer needs OWNER_ROLE_ID / ADMIN_ROLE_ID / MEMBER_ROLE_ID in wrangler.toml.
-- IDs supplied by the club owner. The two owner/admin roles are both mapped to the owner group; split one into 'administrator' in
-- Boardroom → Organization if admins should not have owner rights. Editable there at any time.
INSERT INTO discord_roles (server_id, role_id, label, permission_group)
SELECT s.id, v.role_id, v.label, v.grp
FROM discord_servers s
JOIN (
  SELECT '1328824547104919604' AS role_id, 'Owner / admin' AS label, 'owner' AS grp
  UNION ALL SELECT '1344758233096519733', 'Owner / admin', 'owner'
  UNION ALL SELECT '1440063888388391041', 'Manager', 'manager'
  UNION ALL SELECT '1344757388766482452', 'Manager', 'manager'
  UNION ALL SELECT '1328824701409038337', 'Member', 'player'
) v
WHERE s.guild_id = '1328821938243637381'
  AND NOT EXISTS (SELECT 1 FROM discord_roles r WHERE r.server_id = s.id AND r.role_id = v.role_id);
