-- Rename the field collection module's display name from MELRAH FIELD to NGUZO FIELD.
-- Display name only: the module key (logistics.field), RPC names (melrah_field_*),
-- the evidence storage bucket and offline cache keys stay unchanged so deployed
-- clients and queued offline pickups keep working.
update core.module
   set name = 'NGUZO FIELD'
 where key = 'logistics.field';
