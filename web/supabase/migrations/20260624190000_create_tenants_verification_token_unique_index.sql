-- Partial unique index on tenants_table.verification_token.
-- Enforces uniqueness of verification tokens while allowing many rows to have a NULL token,
-- so token generation can rely on a unique-violation retry against this index.
create unique index tenants_verification_token_key
  on tenants_table (verification_token)
  where verification_token is not null;
