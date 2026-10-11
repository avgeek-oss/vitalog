ALTER TABLE oauth_authorization_codes ADD COLUMN access_level text CHECK (access_level IN ('read','write','admin'));
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN oauth_access_level text CHECK (oauth_access_level IN ('read','write','admin'));
--> statement-breakpoint
UPDATE oauth_authorization_codes SET access_level=CASE WHEN 'health:write'=ANY(scopes) THEN 'write' ELSE 'read' END;
--> statement-breakpoint
UPDATE api_keys SET oauth_access_level=CASE WHEN 'health:write'=ANY(oauth_scopes) THEN 'write' ELSE 'read' END WHERE oauth_client_id IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION revoke_changed_mcp_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.oauth_access_level IS DISTINCT FROM NEW.oauth_access_level AND OLD.oauth_client_id IS NOT NULL THEN
    NEW.revoked_at=now();
    UPDATE oauth_authorization_codes SET consumed_at=now() WHERE api_key_id=OLD.id AND consumed_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER revoke_changed_mcp_access BEFORE UPDATE OF oauth_access_level ON api_keys FOR EACH ROW EXECUTE FUNCTION revoke_changed_mcp_access();
