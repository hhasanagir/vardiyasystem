import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding compliance data...\n');

  // ─── Consent Templates ──────────────────────────────────
  const consentTemplates = [
    {
      id: 'ct-data-processing',
      title: 'Kişisel Verilerin İşlenmesi',
      description:
        'KVKK kapsamında kişisel verilerin işlenmesine ilişkin aydınlatma ve onay',
      purpose: 'DATA_PROCESSING' as const,
      version: 1,
      requiredText: 'Bu onay metnini okuyup kabul etmeniz gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-communication',
      title: 'İletişim İzni',
      description: 'E-posta ve SMS yoluyla bildirim gönderimi için izin',
      purpose: 'COMMUNICATION' as const,
      version: 1,
      requiredText:
        'İletişim izni vermeniz durumunda bildirim gönderilecektir.',
      isActive: true,
    },
    {
      id: 'ct-biometric-auth',
      title: 'Biyometrik Doğrulama',
      description:
        'Parmak izi / yüz tanıma ile giriş-çıkış doğrulaması için izin',
      purpose: 'BIOMETRIC_AUTH' as const,
      version: 1,
      requiredText:
        'Biyometrik veri işlenmesi için açık rızanız gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-push-notifications',
      title: 'Push Bildirimleri',
      description: 'Mobil uygulama üzerinden anlık bildirim alımı için izin',
      purpose: 'PUSH_NOTIFICATIONS' as const,
      version: 1,
      requiredText: 'Push bildirimi almak için izin vermeniz gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-email-notifications',
      title: 'E-posta Bildirimleri',
      description:
        'E-posta yoluyla vardiya değişiklikleri ve duyurular için izin',
      purpose: 'EMAIL_NOTIFICATIONS' as const,
      version: 1,
      requiredText: 'E-posta bildirimi almak için izin vermeniz gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-sms-notifications',
      title: 'SMS Bildirimleri',
      description: 'SMS yoluyla acil durum ve kritik bildirimler için izin',
      purpose: 'SMS_NOTIFICATIONS' as const,
      version: 1,
      requiredText: 'SMS bildirimi almak için izin vermeniz gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-data-sharing',
      title: 'Veri Paylaşımı',
      description:
        'Kişisel verilerin üçüncü taraflarla paylaşılması için açık rıza',
      purpose: 'DATA_SHARING' as const,
      version: 1,
      requiredText:
        'Verilerinizin paylaşılmasına izin vermeniz durumunda ilgili taraflarla paylaşılacaktır.',
      isActive: true,
    },
    {
      id: 'ct-third-party-processing',
      title: 'Üçüncü Taraf İşleme',
      description: 'Verilerin iş ortakları tarafından işlenmesi için onay',
      purpose: 'THIRD_PARTY_PROCESSING' as const,
      version: 1,
      requiredText:
        'Üçüncü tarafların verilerinizi işlemesine izin vermeniz gerekmektedir.',
      isActive: true,
    },
    {
      id: 'ct-emergency-access',
      title: 'Acil Erişim Bildirimi',
      description:
        'Acil durumlarda yetkililerin verilerinize erişebileceğine dair bildirim',
      purpose: 'EMERGENCY_ACCESS' as const,
      version: 1,
      requiredText:
        'Acil durumlarda verilerinize erişilebileceğini kabul ediyorum.',
      isActive: true,
    },
    {
      id: 'ct-research-analytics',
      title: 'Araştırma ve Analiz',
      description:
        'Anonimleştirilmiş verilerin araştırma ve analiz amaçlı kullanımı için izin',
      purpose: 'RESEARCH_ANALYTICS' as const,
      version: 1,
      requiredText:
        'Verilerinizin anonimleştirilerek araştırma amaçlı kullanılmasına izin verebilirsiniz.',
      isActive: true,
    },
  ];

  for (const template of consentTemplates) {
    await prisma.consentTemplate.upsert({
      where: { id: template.id },
      update: template,
      create: template,
    });
    console.log(
      `  ✓ Consent template: ${template.title} (${template.purpose})`,
    );
  }

  // ─── Data Retention Policies ────────────────────────────
  const retentionPolicies = [
    {
      entityType: 'audit_logs',
      retentionDays: 3650,
      archiveAfterDays: null,
      purgeAfterDays: 3650,
      description: 'Denetim kayıtları - 10 yıl (KVKK 138/152)',
      isActive: true,
    },
    {
      entityType: 'auth_attempts',
      retentionDays: 90,
      archiveAfterDays: null,
      purgeAfterDays: 90,
      description: 'Giriş denemeleri - 90 gün',
      isActive: true,
    },
    {
      entityType: 'auth_sessions',
      retentionDays: 365,
      archiveAfterDays: null,
      purgeAfterDays: 395,
      description: 'Oturum kayıtları - 1 yıl',
      isActive: true,
    },
    {
      entityType: 'consent_records',
      retentionDays: 3650,
      archiveAfterDays: 365,
      purgeAfterDays: 3650,
      description: 'Rıza kayıtları - 10 yıl',
      isActive: true,
    },
    {
      entityType: 'data_subject_requests',
      retentionDays: 3650,
      archiveAfterDays: null,
      purgeAfterDays: 3650,
      description: 'Veri sahibi talepleri - 10 yıl',
      isActive: true,
    },
    {
      entityType: 'emergency_access_grants',
      retentionDays: 1825,
      archiveAfterDays: null,
      purgeAfterDays: 1825,
      description: 'Acil erişim kayıtları - 5 yıl',
      isActive: true,
    },
    {
      entityType: 'breach_records',
      retentionDays: 3650,
      archiveAfterDays: null,
      purgeAfterDays: 3650,
      description: 'Veri ihlali kayıtları - 10 yıl',
      isActive: true,
    },
    {
      entityType: 'notification_deliveries',
      retentionDays: 180,
      archiveAfterDays: null,
      purgeAfterDays: 180,
      description: 'Bildirim teslimat kayıtları - 6 ay',
      isActive: true,
    },
    {
      entityType: 'token_blacklist',
      retentionDays: 7,
      archiveAfterDays: null,
      purgeAfterDays: 7,
      description: 'Token kara listesi - 7 gün',
      isActive: true,
    },
    {
      entityType: 'device_incidents',
      retentionDays: 1825,
      archiveAfterDays: null,
      purgeAfterDays: 1825,
      description: 'Cihaz arıza kayıtları - 5 yıl',
      isActive: true,
    },
    {
      entityType: 'handover_notes',
      retentionDays: 730,
      archiveAfterDays: null,
      purgeAfterDays: 730,
      description: 'Devir teslim notları - 2 yıl',
      isActive: true,
    },
  ];

  for (const policy of retentionPolicies) {
    await prisma.dataRetentionPolicy.upsert({
      where: { entityType: policy.entityType },
      update: policy,
      create: policy,
    });
    console.log(
      `  ✓ Retention policy: ${policy.entityType} (${policy.retentionDays}g)`,
    );
  }

  // ─── Processing Activities (GDPR Art. 30 Register) ─────
  const processingActivities = [
    {
      activityId: 'PA-001',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: 'Azure Kubernetes Service (Microsoft)',
      purpose: 'Vardiya planlaması ve personel yönetimi',
      dataCategories: [
        'Ad-soyad',
        'E-posta',
        'Telefon',
        'Birim',
        'Ünvan',
        'Vardiya tercihleri',
      ],
      dataSubjects: ['Çalışanlar', 'Yöneticiler'],
      legalBasis: 'KVKK Madde 5/2-c (Sözleşmenin ifası), GDPR Art. 6(1)(b)',
      retentionPeriod: 'İş ilişkisi süresince + 10 yıl',
      securityMeasures: [
        'AES-256-GCM şifreleme',
        'RBAC',
        'mTLS',
        'Denetim kaydı',
        'Erişim kontrolü',
      ],
      crossBorderTransfer: null,
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-002',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: 'Azure Kubernetes Service (Microsoft)',
      purpose: 'Devir teslim notu yönetimi',
      dataCategories: [
        'Ad-soyad',
        'Birim',
        'Vardiya bilgisi',
        'Hasta notları (serbest metin)',
      ],
      dataSubjects: ['Çalışanlar', 'Hastalar (dolaylı)'],
      legalBasis: 'KVKK Madde 5/2-ç (Kanuni yükümlülük), GDPR Art. 6(1)(c)',
      retentionPeriod: 'Oluşturulma tarihinden itibaren 2 yıl',
      securityMeasures: [
        'Denetim kaydı',
        'RBAC',
        'Veri sınıflandırması',
        'Elle girilen PHI için uyarı',
      ],
      crossBorderTransfer: null,
      dpiaRequired: true,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-003',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: 'Azure Kubernetes Service (Microsoft)',
      purpose: 'Yoklama ve mesai takibi',
      dataCategories: [
        'Ad-soyad',
        'Giriş-çıkış zamanı',
        'IP adresi',
        'Çalışılan birim',
      ],
      dataSubjects: ['Çalışanlar'],
      legalBasis: 'KVKK Madde 5/2-c (Sözleşmenin ifası), İş Kanunu 49. madde',
      retentionPeriod: 'Takvim yılı sonundan itibaren 5 yıl',
      securityMeasures: ['Denetim kaydı', 'IP kaydı', 'RBAC'],
      crossBorderTransfer: null,
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-004',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: 'Azure Communication Services / SendGrid',
      purpose: 'Bildirim ve iletişim gönderimi',
      dataCategories: ['Ad-soyad', 'E-posta', 'Push bildirim token', 'Telefon'],
      dataSubjects: ['Çalışanlar'],
      legalBasis: 'Açık rıza (KVKK Madde 5/1), GDPR Art. 6(1)(a)',
      retentionPeriod: 'Rıza süresince + 90 gün',
      securityMeasures: [
        'Anonimleştirilmiş içerik',
        'Minimal veri',
        'DPA ile koruma',
      ],
      crossBorderTransfer: 'Microsoft ABD (SCC + DPA)',
      dpiaRequired: true,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-005',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: null,
      purpose: 'Veri ihlali yönetimi ve bildirimi',
      dataCategories: [
        'İhlal detayları',
        'Etkilenen veri kategorileri',
        'Zaman damgası',
        'Tedbir kayıtları',
      ],
      dataSubjects: ['Çalışanlar', 'Hastalar', 'İş ortakları'],
      legalBasis: 'KVKK Madde 12, GDPR Art. 33-34 (Kanuni yükümlülük)',
      retentionPeriod: 'İhlal tarihinden itibaren 10 yıl',
      securityMeasures: ['Özel erişim kontrolü', 'Denetim kaydı', 'Şifreleme'],
      crossBorderTransfer: null,
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-006',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: null,
      purpose: 'Personel yetenek ve sertifika yönetimi',
      dataCategories: [
        'Ad-soyad',
        'Sertifika bilgileri',
        'Geçerlilik tarihleri',
        'Eğitim kayıtları',
      ],
      dataSubjects: ['Çalışanlar'],
      legalBasis:
        'KVKK Madde 5/2-c (Sözleşmenin ifası), Sağlık Bakanlığı yönetmelikleri',
      retentionPeriod: 'Sertifika geçerlilik süresi + 2 yıl',
      securityMeasures: ['RBAC', 'Denetim kaydı'],
      crossBorderTransfer: null,
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-007',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: 'Firebase Cloud Messaging (Google)',
      purpose: 'Acil durum ve kritik bildirim iletimi',
      dataCategories: ['Push token', 'Cihaz tipi', 'Bildirim içeriği (anonim)'],
      dataSubjects: ['Çalışanlar'],
      legalBasis:
        'KVKK Madde 5/2-ç (Kanuni yükümlülük), İş sağlığı ve güvenliği',
      retentionPeriod: 'Token geçerlilik süresince',
      securityMeasures: [
        'Anonim bildirim içeriği',
        'DPA ile koruma',
        'Minimal veri',
      ],
      crossBorderTransfer: 'Google ABD (SCC + DPA)',
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
    {
      activityId: 'PA-008',
      controller: 'VardiyaOS Sağlık Sistemleri A.Ş.',
      processor: null,
      purpose: 'Cihaz yönetimi ve arıza takibi',
      dataCategories: [
        'Cihaz seri numarası',
        'Konum',
        'Arıza açıklaması',
        'Müdahale kaydı',
      ],
      dataSubjects: ['Çalışanlar', 'Hastalar (dolaylı)'],
      legalBasis:
        'KVKK Madde 5/2-ç (Kanuni yükümlülük), Tıbbi cihaz yönetmelikleri',
      retentionPeriod: 'Cihaz ömrü + 5 yıl',
      securityMeasures: ['RBAC', 'Denetim kaydı', 'Veri sınıflandırması'],
      crossBorderTransfer: null,
      dpiaRequired: false,
      dpiaCompleted: false,
      isActive: true,
    },
  ];

  for (const activity of processingActivities) {
    await prisma.processingActivity.upsert({
      where: { activityId: activity.activityId },
      update: activity,
      create: activity,
    });
    console.log(
      `  ✓ Processing activity: ${activity.activityId} - ${activity.purpose}`,
    );
  }

  console.log('\n✅ Compliance seed completed successfully');
  console.log(`   - ${consentTemplates.length} consent templates`);
  console.log(`   - ${retentionPolicies.length} retention policies`);
  console.log(`   - ${processingActivities.length} processing activities`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
