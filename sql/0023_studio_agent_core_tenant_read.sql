-- studio-agent: let the render worker file renders that have no project.
--
-- sql/0021 gives every tenant-scoped table the column default
-- core.tenant_id('cts'), so a vault row with no project lands in CTS.
-- studio-agent writes as service_role, which had no USAGE on schema core,
-- so evaluating that default failed with "permission denied for schema core"
-- and the render queue could not file a project-less render.
--
-- service_role already bypasses RLS and holds the service key; this only
-- lets it read the tenant list. Nothing is granted to anon or authenticated.
grant usage on schema core to service_role;
grant select on core.tenant to service_role;
