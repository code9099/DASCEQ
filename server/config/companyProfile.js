/**
 * Configurable, verified company knowledge profile for Dasceq.
 * Strictly avoids fabricating unverified company services, office addresses, pricing figures,
 * or SLAs when `COMPANY_*` environment variables are not configured.
 * When `COMPANY_*` variables are left empty, safe honest fallback responses explain what
 * this virtual assistant handles and direct custom service/pricing requests to consultation follow-up.
 */

function parseConfiguredServices(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return [];
  const trimmed = raw.trim();

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item.name === 'string' && item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            summary: typeof item.summary === 'string' ? item.summary.trim() : '',
          }));
      }
    } catch {
      // Fall through to delimiter parsing
    }
  }

  return trimmed
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':');
      if (idx === -1) return { name: entry, summary: '' };
      return {
        name: entry.slice(0, idx).trim(),
        summary: entry.slice(idx + 1).trim(),
      };
    })
    .filter((item) => item.name);
}

const configuredServices = parseConfiguredServices(process.env.COMPANY_SERVICES);
const hasConfiguredOverview = Boolean((process.env.COMPANY_OVERVIEW || '').trim());
const hasConfiguredHours = Boolean((process.env.COMPANY_WORKING_HOURS || '').trim());
const hasConfiguredPricing = Boolean((process.env.COMPANY_PRICING_NOTE || '').trim());

const DEFAULT_ASSISTANT_CAPABILITIES = [
  {
    name: 'Customer Enquiries',
    summary: 'Capture your questions and project requirements so our team can follow up directly.',
  },
  {
    name: 'Appointment Scheduling',
    summary: 'Book verified 30-minute consultation slots in Asia/Kolkata (IST) timezone.',
  },
  {
    name: 'Booking Lookup',
    summary: 'Check the status of an existing appointment using your DSQ-XXXXXX reference.',
  },
];

const companyProfile = {
  name: (process.env.COMPANY_NAME || 'Dasceq').trim(),
  subtitle: (process.env.COMPANY_SUBTITLE || 'Intelligent Customer Experience').trim(),
  isOverviewConfigured: hasConfiguredOverview,
  overview: hasConfiguredOverview
    ? process.env.COMPANY_OVERVIEW.trim()
    : 'Dasceq provides this virtual receptionist to assist with customer enquiries and consultation scheduling. Detailed company offerings and engagement terms are shared directly by our team.',
  hasConfiguredServices: configuredServices.length > 0,
  services: configuredServices,
  fallbackCapabilities: DEFAULT_ASSISTANT_CAPABILITIES,
  isHoursConfigured: hasConfiguredHours,
  workingHours: hasConfiguredHours
    ? process.env.COMPANY_WORKING_HOURS.trim()
    : 'Appointment scheduling slots run Monday to Friday, 9:00 AM to 6:00 PM IST (30-minute slots from 9:00 AM to 5:30 PM IST; closed on weekends).',
  timezone: 'Asia/Kolkata (IST)',
  isPricingConfigured: hasConfiguredPricing,
  pricingNote: hasConfiguredPricing
    ? process.env.COMPANY_PRICING_NOTE.trim()
    : 'Pricing and engagement details are not published through this assistant and are shared directly by our team based on your requirements.',
  bookingPolicy:
    'Appointments require verified customer contact details, real slot availability in IST, and explicit confirmation before a DSQ booking reference is issued.',
};

/**
 * Format company overview, configured services (or honest fallback capabilities), and booking hours.
 */
function formatServicesMessage() {
  const items = companyProfile.hasConfiguredServices
    ? companyProfile.services
    : companyProfile.fallbackCapabilities;

  const bullets = items
    .map((svc) => (svc.summary ? `• **${svc.name}:** ${svc.summary}` : `• **${svc.name}**`))
    .join('\n');

  const lines = [
    companyProfile.overview,
    '',
    companyProfile.hasConfiguredServices
      ? 'Here are our configured services:'
      : 'Specific company service catalogs are not pre-loaded in this assistant, so our team shares exact service details directly upon enquiry or consultation. Through this assistant, I can help you with:',
    bullets,
    '',
    `**Scheduling Hours:** ${companyProfile.workingHours}`,
    '',
    'Would you like to share your enquiry details for our team or schedule an appointment?',
  ];

  return lines.join('\n');
}

/**
 * Format verified facts block for Gemini system instructions.
 */
function getCompanyPromptBlock() {
  const items = companyProfile.hasConfiguredServices
    ? companyProfile.services
    : companyProfile.fallbackCapabilities;

  const serviceLines = items
    .map((svc) => `  - ${svc.name}${svc.summary ? `: ${svc.summary}` : ''}`)
    .join('\n');

  return [
    'COMPANY KNOWLEDGE POLICY (ONLY state facts explicitly configured below; NEVER invent office addresses, specific service offerings, prices, turnaround times, SLAs, or employee names):',
    `- Company: ${companyProfile.name} (${companyProfile.subtitle})`,
    `- Overview: ${companyProfile.overview}`,
    `- Scheduling Hours: ${companyProfile.workingHours}`,
    `- Pricing Policy: ${companyProfile.pricingNote}`,
    companyProfile.hasConfiguredServices
      ? `- Configured Services:\n${serviceLines}`
      : `- Official service catalog not configured in env. Only mention these assistant capabilities and invite customer to share requirements or book a consultation:\n${serviceLines}`,
  ].join('\n');
}

module.exports = {
  companyProfile,
  formatServicesMessage,
  getCompanyPromptBlock,
  parseConfiguredServices,
};
