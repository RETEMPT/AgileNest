export const SETTINGS_SECTIONS = ["profile", "academic", "projects", "ai", "appearance", "connections"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export function settingsSection(value?: string): SettingsSection {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? "profile";
}
