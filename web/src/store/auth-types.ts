export type AuthRole = "admin" | "user";

export type AuthMenuItem = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order?: number;
  children?: AuthMenuItem[];
};

export type StoredAuthSession = {
  key: string;
  role: AuthRole;
  roleId?: string;
  roleName?: string;
  subjectId: string;
  name: string;
  provider?: string;
  menuPaths: string[];
  apiPermissions: string[];
  menus: AuthMenuItem[];
};

export type SetStoredAuthSessionOptions = {
  rememberMe?: boolean;
};
