export interface RuntimeRoleConfig {
  /** Connection of the schema owner (migration role) that applies the grants. */
  ownerDatabaseUrl: string;
  roleName: string;
  password: string;
}

/** Effective privileges of the runtime role on one table in `public`. */
export interface RuntimeRoleTableGrant {
  table: string;
  privileges: string[];
}
