/** Minimal i18n shell — expand catalogs over time. */

export type AppLanguage = 'en' | 'es' | 'fr' | 'de' | 'hi' | 'pt';

const catalogs: Record<AppLanguage, Record<string, string>> = {
  en: {
    'settings.title': 'Settings',
    'settings.safety': 'Safety & privacy',
    'settings.mfa': 'Two-factor authentication',
    'settings.export': 'Download your data',
    'settings.delete': 'Delete account permanently',
    'settings.sensitive': 'Hide sensitive content',
    'settings.loginAlerts': 'Login alerts',
    'settings.reduceMotion': 'Reduce motion',
    'report.title': 'Report',
    'report.submit': 'Submit report',
    'report.thanks': 'Thanks — we received your report.',
  },
  es: {
    'settings.title': 'Ajustes',
    'settings.safety': 'Seguridad y privacidad',
    'settings.mfa': 'Autenticación en dos pasos',
    'settings.export': 'Descargar tus datos',
    'settings.delete': 'Eliminar cuenta permanentemente',
    'settings.sensitive': 'Ocultar contenido sensible',
    'settings.loginAlerts': 'Alertas de inicio de sesión',
    'settings.reduceMotion': 'Reducir movimiento',
    'report.title': 'Denunciar',
    'report.submit': 'Enviar denuncia',
    'report.thanks': 'Gracias — recibimos tu denuncia.',
  },
  fr: {
    'settings.title': 'Paramètres',
    'settings.safety': 'Sécurité et confidentialité',
    'settings.mfa': 'Authentification à deux facteurs',
    'settings.export': 'Télécharger vos données',
    'settings.delete': 'Supprimer le compte définitivement',
    'settings.sensitive': 'Masquer le contenu sensible',
    'settings.loginAlerts': 'Alertes de connexion',
    'settings.reduceMotion': 'Réduire les animations',
    'report.title': 'Signaler',
    'report.submit': 'Envoyer le signalement',
    'report.thanks': 'Merci — nous avons reçu votre signalement.',
  },
  de: {
    'settings.title': 'Einstellungen',
    'settings.safety': 'Sicherheit & Datenschutz',
    'settings.mfa': 'Zwei-Faktor-Authentifizierung',
    'settings.export': 'Daten herunterladen',
    'settings.delete': 'Konto dauerhaft löschen',
    'settings.sensitive': 'Sensible Inhalte ausblenden',
    'settings.loginAlerts': 'Anmeldebenachrichtigungen',
    'settings.reduceMotion': 'Bewegung reduzieren',
    'report.title': 'Melden',
    'report.submit': 'Meldung senden',
    'report.thanks': 'Danke — wir haben deine Meldung erhalten.',
  },
  hi: {
    'settings.title': 'सेटिंग्स',
    'settings.safety': 'सुरक्षा और गोपनीयता',
    'settings.mfa': 'दो-चरणीय प्रमाणीकरण',
    'settings.export': 'अपना डेटा डाउनलोड करें',
    'settings.delete': 'खाता स्थायी रूप से हटाएँ',
    'settings.sensitive': 'संवेदनशील सामग्री छिपाएँ',
    'settings.loginAlerts': 'लॉगिन अलर्ट',
    'settings.reduceMotion': 'मोशन कम करें',
    'report.title': 'रिपोर्ट',
    'report.submit': 'रिपोर्ट भेजें',
    'report.thanks': 'धन्यवाद — आपकी रिपोर्ट मिल गई।',
  },
  pt: {
    'settings.title': 'Definições',
    'settings.safety': 'Segurança e privacidade',
    'settings.mfa': 'Autenticação de dois fatores',
    'settings.export': 'Descarregar os seus dados',
    'settings.delete': 'Eliminar conta permanentemente',
    'settings.sensitive': 'Ocultar conteúdo sensível',
    'settings.loginAlerts': 'Alertas de início de sessão',
    'settings.reduceMotion': 'Reduzir movimento',
    'report.title': 'Denunciar',
    'report.submit': 'Enviar denúncia',
    'report.thanks': 'Obrigado — recebemos a sua denúncia.',
  },
};

export function t(language: AppLanguage, key: string): string {
  return catalogs[language]?.[key] ?? catalogs.en[key] ?? key;
}

export const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'pt', label: 'Português' },
];
