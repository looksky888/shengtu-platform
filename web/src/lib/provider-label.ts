/** Account provider id → display label, shared by the profile card and the user admin table. */
export function providerLabel(provider?: string) {
  if (provider === "local" || !provider) {
    return "本地账号";
  }
  // Legacy third-party providers (e.g. removed OAuth) still show their raw label.
  return provider;
}
