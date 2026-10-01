import { PageContext } from '../../shared/page-header';

export interface PageConfigEntry {
  path: string;
  context: PageContext;
}

export const PAGE_CONFIGS: PageConfigEntry[] = [
  {
    path: '/app/dashboard',
    context: {
      title: 'Kontrol Paneli',
      subtitle: 'Operasyonel görünüm ve birim performansı',
      breadcrumbs: [{ label: 'Ana Sayfa' }],
      status: { label: 'Canlı', color: 'success', pulse: true },
      actions: [
        {
          id: 'refresh',
          label: 'Yenile',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
          severity: 'ghost',
        },
      ],
    },
  },
  {
    path: '/app/my-day',
    context: {
      title: 'Bugünkü Vardiyam',
      subtitle: 'Günlük vardiya, görev ve bildirimler',
      breadcrumbs: [{ label: 'Vardiyalarım', path: '/app/my-shifts' }, { label: 'Bugün' }],
    },
  },
  {
    path: '/app/my-shifts',
    context: {
      title: 'Vardiyalarım',
      subtitle: 'Geçmiş ve planlanmış vardiya geçmişiniz',
      breadcrumbs: [{ label: 'Vardiyalarım' }],
    },
  },
  {
    path: '/app/leave-management',
    context: {
      title: 'İzin Yönetimi',
      subtitle: 'İzin talepleri, onaylar ve bakiye görünümü',
      breadcrumbs: [{ label: 'İşlemler' }, { label: 'İzin Talepleri' }],
    },
  },
  {
    path: '/app/swap-requests',
    context: {
      title: 'Vardiya Değişim',
      subtitle: 'Vardiya takas ve değişim talepleri',
      breadcrumbs: [{ label: 'İşlemler' }, { label: 'Vardiya Değişim' }],
    },
  },
  {
    path: '/app/mr-plan',
    context: {
      title: 'MR Planı',
      subtitle: 'Manyetik Rezonans ünitesi vardiya planlaması',
      breadcrumbs: [{ label: 'Planlama' }, { label: 'MR' }],
    },
  },
  {
    path: '/app/bt-plan',
    context: {
      title: 'BT Planı',
      subtitle: 'Bilgisayarlı Tomografi ünitesi vardiya planlaması',
      breadcrumbs: [{ label: 'Planlama' }, { label: 'BT' }],
    },
  },
  {
    path: '/app/rontgen-plan',
    context: {
      title: 'Röntgen Planı',
      subtitle: 'Röntgen ünitesi vardiya planlaması',
      breadcrumbs: [{ label: 'Planlama' }, { label: 'Röntgen' }],
    },
  },
  {
    path: '/app/nukleer-tip-plan',
    context: {
      title: 'Nükleer Tıp Planı',
      subtitle: 'Nükleer Tıp ünitesi vardiya planlaması',
      breadcrumbs: [{ label: 'Planlama' }, { label: 'Nükleer Tıp' }],
    },
  },
  {
    path: '/app/onkoloji-plan',
    context: {
      title: 'Radyasyon Onkolojisi Planı',
      subtitle: 'RONK ünitesi vardiya planlaması',
      breadcrumbs: [{ label: 'Planlama' }, { label: 'RONK' }],
    },
  },
  {
    path: '/app/employees',
    context: {
      title: 'Personel',
      subtitle: 'Personel yönetimi, yetkinlikler ve durumlar',
      breadcrumbs: [{ label: 'Operasyon' }, { label: 'Personel' }],
    },
  },
  {
    path: '/app/supervisor',
    context: {
      title: 'Süpervizör Paneli',
      subtitle: 'Komuta merkezi, canlı metrikler ve operasyon yönetimi',
      breadcrumbs: [{ label: 'Operasyon' }, { label: 'Süpervizör' }],
      status: { label: 'Canlı', color: 'success', pulse: true },
      actions: [
        {
          id: 'refresh',
          label: 'Yenile',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
          severity: 'ghost',
        },
      ],
    },
  },
  {
    path: '/app/live-tracking',
    context: {
      title: 'Canlı Vardiya Takibi',
      subtitle: 'Gerçek zamanlı personel konum ve durum bilgileri',
      breadcrumbs: [{ label: 'Operasyon' }, { label: 'Canlı Takip' }],
      status: { label: 'Canlı', color: 'success', pulse: true },
    },
  },
  {
    path: '/app/shifts',
    context: {
      title: 'Vardiya Tanımları',
      subtitle: 'Vardiya türleri, saatleri ve zaman çizelgeleri',
      breadcrumbs: [{ label: 'Operasyon' }, { label: 'Vardiya Tanımları' }],
    },
  },
  {
    path: '/app/handover-notes',
    context: {
      title: 'Devir Teslim Notları',
      subtitle: 'Vardiya devir teslim kayıtları ve notlar',
      breadcrumbs: [{ label: 'İşlemler' }, { label: 'Devir Teslim' }],
    },
  },
  {
    path: '/app/device-incidents',
    context: {
      title: 'Arıza ve Bakım Bildirimi',
      subtitle: 'Cihaz arıza, bakım ve servis kayıtları',
      breadcrumbs: [{ label: 'İşlemler' }, { label: 'Arıza Bildirimi' }],
    },
  },
  {
    path: '/app/trainings',
    context: {
      title: 'Sertifika ve Eğitim Yönetimi',
      subtitle: 'Personel sertifika, eğitim ve yetkinlik takibi',
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Sertifikalar' }],
    },
  },
  {
    path: '/app/skills',
    context: {
      title: 'Yetkinlik Matrisi',
      subtitle: 'Personel yetkinlik ve beceri haritası',
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Yetkinlikler' }],
    },
  },
  {
    path: '/app/approval-center',
    context: {
      title: 'Onay Merkezi',
      subtitle: 'Bekleyen onay talepleri ve iş akışı',
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Onaylar' }],
    },
  },
  {
    path: '/app/reports',
    context: {
      title: 'Raporlar',
      subtitle: 'Operasyonel raporlar, analizler ve dökümler',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'Raporlar' }],
    },
  },
  {
    path: '/app/performance',
    context: {
      title: 'Performans',
      subtitle: 'Personel performans metrikleri ve değerlendirme',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'Performans' }],
    },
  },
  {
    path: '/app/fairness-analysis',
    context: {
      title: 'Adalet Analizi',
      subtitle: 'Vardiya dağılım adaleti ve yük dengesi',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'Adalet Analizi' }],
    },
  },
  {
    path: '/app/audit',
    context: {
      title: 'Denetim Merkezi',
      subtitle: 'Sistem değişiklikleri ve güvenlik kayıtları',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'Denetim' }],
    },
  },
  {
    path: '/app/management-dashboard',
    context: {
      title: 'Yönetim Paneli',
      subtitle: 'Üst düzey operasyonel metrikler ve analizler',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'Yönetim Paneli' }],
    },
  },
  {
    path: '/app/settings',
    context: {
      title: 'Sistem Ayarları',
      subtitle: 'Uygulama yapılandırması ve tercihler',
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Ayarlar' }],
    },
  },
  {
    path: '/app/notifications',
    context: {
      title: 'Bildirimler',
      subtitle: 'Sistem bildirimleri ve uyarı geçmişi',
      breadcrumbs: [{ label: 'Bildirimler' }],
    },
  },
  {
    path: '/app/profile',
    context: {
      title: 'Profilim',
      subtitle: 'Kişisel bilgiler, tercihler ve hesap ayarları',
      breadcrumbs: [{ label: 'Hesap' }, { label: 'Profilim' }],
    },
  },
  {
    path: '/app/command-center',
    context: {
      title: 'Komuta Merkezi',
      subtitle: 'Merkezi operasyon yönetimi ve canlı metrikler',
      breadcrumbs: [{ label: 'Operasyon' }, { label: 'Komuta' }],
      status: { label: 'Canlı', color: 'success', pulse: true },
    },
  },
  {
    path: '/app/kpi-overview',
    context: {
      title: 'KPI Göstergeleri',
      subtitle: 'Performans metrikleri ve hedef takibi',
      breadcrumbs: [{ label: 'Analitik' }, { label: 'KPI' }],
    },
  },
  {
    path: '/app/smart-recommendations',
    context: {
      title: 'Akıllı Öneriler',
      subtitle: 'Yapay zeka destekli optimizasyon önerileri',
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Öneriler' }],
    },
  },
];
