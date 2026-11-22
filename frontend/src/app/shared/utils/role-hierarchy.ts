export const ROLE_HIERARCHY: Record<string, number> = {
  system_admin: 1000,
  hospital_admin: 800,
  project_manager: 700,
  imaging_director: 600,
  chief_technician: 550,
  supervisor: 500,
  field_supervisor: 450,
  medical_engineer: 400,
  hr: 350,
  senior_technician: 300,
  technician: 200,
  assistant_technician: 150,
  secretary: 100,
  guest: 50,
};

export const ROLE_LABELS: Record<string, string> = {
  system_admin: 'Sistem Yöneticisi',
  hospital_admin: 'Hastane Yöneticisi',
  project_manager: 'Proje Yöneticisi',
  imaging_director: 'Görüntüleme Hiz. Müdürü',
  chief_technician: 'Baş Tekniker',
  supervisor: 'Süpervizör',
  field_supervisor: 'Saha Sorumlusu',
  medical_engineer: 'Medikal Mühendis',
  hr: 'İnsan Kaynakları',
  senior_technician: 'Sorumlu Tekniker',
  technician: 'Tekniker',
  assistant_technician: 'Yardımcı Tekniker',
  secretary: 'Sekreter',
  guest: 'Misafir',
};

export function hasMinRole(userRole: string, minRole?: string): boolean {
  if (!minRole) return true;
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  return userLevel >= requiredLevel;
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}
